import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { GAME_CONFIG } from '../config/gameConfig';
import type { FleetVehicle, OnlineConnectionState, OnlineHudSnapshot, PlayerSave, Point } from '../types/game';
import { isCloudEnabled, supabase } from '../services/supabase/client';
import { movementRateHz, shouldSendMovement } from './adaptiveRate';
import { desiredChunkTopics } from './chunkHandoff';
import { deserializeMovement, localPositionForChunk, movementPayloadBytes, serializeMovement, type MovementSnapshot, type OnlineControllerType, type TurnSignal } from './protocol';

export interface PublicPresence {
  sessionId: string;
  publicPlayerId: string;
  driverName: string;
  avatarId: string;
  fleetPublicId: string | null;
  fleetName: string | null;
  fleetColor: string | null;
  chunkId: string;
  vehicleId: string;
  vehicleModel: FleetVehicle['model'];
  controllerType: OnlineControllerType;
  status: 'driving' | 'idle';
  joinedAt: string;
}

export interface LocalMovementState {
  vehicleId: string;
  controllerType: OnlineControllerType;
  vehicleModel: FleetVehicle['model'];
  position: Point;
  heading: number;
  speed: number;
  acceleration: number;
  layer?: number;
  occupied: boolean;
  autopilot: boolean;
  turnSignal?: TurnSignal;
  braking: boolean;
  colorId?: MovementSnapshot['colorId'];
  importantEvent?: boolean;
}

type SnapshotListener = (snapshot: MovementSnapshot, presence?: PublicPresence) => void;
type PresenceListener = (presences: Map<string, PublicPresence>) => void;
type ConnectionListener = (state: OnlineConnectionState) => void;
type MockMessage =
  | { type: 'presence'; sender: string; presence: PublicPresence; requestReply: boolean }
  | { type: 'leave'; sender: string; sessionId: string }
  | { type: 'movement'; sender: string; payload: unknown }
  | { type: 'event'; sender: string; event: string; payload: unknown };

export class OnlineWorldClient {
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly presenceListeners = new Set<PresenceListener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private readonly channels = new Map<string, RealtimeChannel>();
  private readonly presences = new Map<string, PublicPresence>();
  private readonly sequences = new Map<string, number>();
  private readonly lastSentAt = new Map<string, number>();
  private readonly lastHeading = new Map<string, number>();
  private currentChunk = '';
  private adjacentChunks: string[] = [];
  private presenceChannel?: RealtimeChannel;
  private mockChannel?: BroadcastChannel;
  private mockSocket?: WebSocket;
  private heartbeatTimer?: number;
  private reconnectTimer?: number;
  private overlapTimers = new Map<string, number>();
  private started = false;
  private disposed = false;
  private canControl = true;
  private lastVehicle?: LocalMovementState;
  private lastEmployee?: LocalMovementState;
  private sentInWindow = 0;
  private receivedInWindow = 0;
  private rateWindowStarted = Date.now();
  private sendRateHz = 0;
  private receiveRateHz = 0;
  private pingMs: number | null = null;
  private reconnectAttempts = 0;
  private warning: string | null = null;
  private state: OnlineConnectionState = 'OFFLINE';
  private sessionId: string | null = null;
  private serverTimeOffset = 0;
  private debugLatencyMs = 0;
  private debugLossRate = 0;

  constructor(private readonly save: PlayerSave, private readonly client: SupabaseClient | null = supabase) {}

  onSnapshot(listener: SnapshotListener) { this.snapshotListeners.add(listener); return () => this.snapshotListeners.delete(listener); }
  onPresence(listener: PresenceListener) { this.presenceListeners.add(listener); return () => this.presenceListeners.delete(listener); }
  onConnection(listener: ConnectionListener) { this.connectionListeners.add(listener); return () => this.connectionListeners.delete(listener); }

  async start(chunkId: string, adjacentChunks: string[]) {
    if (this.started || this.disposed) return;
    this.started = true;
    this.currentChunk = chunkId;
    this.adjacentChunks = [...adjacentChunks];
    if (this.save.onlinePreference === 'solo') { this.setState('SOLO'); return; }
    if (mockTransportRequested()) { this.startMock(); return; }
    if (!this.client || !isCloudEnabled) {
      this.warning = 'Online indisponível. A partida continua no modo solo.';
      this.setState('SOLO_TEMPORARY');
      return;
    }
    await this.connectSupabase();
  }

  async setMode(mode: PlayerSave['onlinePreference'], chunkId = this.currentChunk, adjacentChunks = this.adjacentChunks) {
    this.save.onlinePreference = mode;
    await this.stop(false);
    this.started = false;
    this.disposed = false;
    await this.start(chunkId, adjacentChunks);
  }

  async updateChunks(chunkId: string, adjacentChunks: string[]) {
    const previousChunk = this.currentChunk;
    this.currentChunk = chunkId;
    this.adjacentChunks = [...adjacentChunks];
    this.save.lastOnlineChunk = chunkId;
    if (this.state !== 'ONLINE') return;
    if (this.mockChannel || this.mockSocket) {
      this.broadcastPresence(false);
      this.sendMock({ type: 'event', sender: this.sessionId!, event: 'chunk-transfer', payload: { previousChunk, chunkId } });
      return;
    }
    if (this.client && this.sessionId) await this.client.functions.invoke('online-heartbeat', { body: {
      version: 1, sessionId: this.sessionId, vehicleId: this.publicVehicleId(this.lastVehicle?.vehicleId ?? this.save.activeVehicleId),
      chunkId, authorizedChunks: [chunkId, ...adjacentChunks], stateVersion: this.activeVehicle()?.stateVersion ?? 1
    }});
    await this.reportLocation('REGION');
    const previousTopics = [...this.channels.keys()].filter((topic) => topic.includes(`:${previousChunk}:`));
    await this.subscribeChunkTopics(chunkId, adjacentChunks);
    await this.trackPresence();
    await this.sendEvent('chunk-transfer', { previousChunk, chunkId, sequence: this.sequenceFor(this.lastVehicle?.vehicleId ?? 'handoff') });
    for (const topic of previousTopics) {
      if (this.overlapTimers.has(topic)) continue;
      const timer = window.setTimeout(() => { void this.removeTopic(topic); }, GAME_CONFIG.online.chunkOverlapMs);
      this.overlapTimers.set(topic, timer);
    }
  }

  updateVehicle(state: LocalMovementState, now = Date.now()) {
    this.lastVehicle = state;
    this.publishMovement(state, now);
  }

  updateEmployee(state: LocalMovementState | null, now = Date.now()) {
    this.lastEmployee = state ?? undefined;
    if (state) this.publishMovement(state, now);
  }

  isOnline() { return this.state === 'ONLINE'; }

  async createFleetDeployment() {
    if (!this.client || this.state !== 'ONLINE' || !this.save.fleet.activeShift) return;
    const shift = this.save.fleet.activeShift;
    await this.client.functions.invoke('create-fleet-deployment', { body: {
      version: 1, shiftId: shift.id, vehicleId: shift.vehicleId, driverId: shift.employeeId,
      region: this.save.currentRegion, chunkId: this.save.currentChunk,
      startsAt: shift.startedAt, endsAt: shift.scheduledEndAt
    }}).catch(() => undefined);
  }

  async finishFleetDeployment(shiftId: string) {
    if (!this.client || this.state !== 'ONLINE') return;
    await this.client.functions.invoke('finish-fleet-deployment', { body: { version: 1, shiftId } }).catch(() => undefined);
  }

  telemetry(extra: Partial<Pick<OnlineHudSnapshot, 'nearbyPlayers' | 'interpolationBuffer' | 'extrapolating' | 'lostPackets' | 'outOfOrderPackets' | 'npcReplacements' | 'remoteEmployees' | 'offlineDeployments'>> = {}): OnlineHudSnapshot {
    this.rollRates();
    const quality = this.state !== 'ONLINE' ? 'offline' : (this.pingMs ?? 0) < 90 ? 'excellent' : (this.pingMs ?? 0) < 180 ? 'good' : 'weak';
    return {
      mode: this.save.onlinePreference, state: this.state, accountLinkState: this.save.accountLinkState, publicSessionId: this.sessionId,
      nearbyPlayers: extra.nearbyPlayers ?? [...this.presences.values()].filter((presence) => presence.controllerType === 'PLAYER').length,
      remoteEmployees: extra.remoteEmployees ?? [...this.presences.values()].filter((presence) => presence.controllerType === 'EMPLOYEE').length,
      offlineDeployments: extra.offlineDeployments ?? 0, pingMs: this.pingMs, quality,
      subscribedTopics: this.mockChannel || this.mockSocket ? [GAME_CONFIG.online.presenceTopic, ...desiredChunkTopics(this.currentChunk, this.adjacentChunks)] : [GAME_CONFIG.online.presenceTopic, ...this.channels.keys()],
      sendRateHz: this.sendRateHz, receiveRateHz: this.receiveRateHz,
      sequence: Math.max(0, ...this.sequences.values()), interpolationBuffer: extra.interpolationBuffer ?? 0,
      extrapolating: extra.extrapolating ?? 0, lostPackets: extra.lostPackets ?? 0,
      outOfOrderPackets: extra.outOfOrderPackets ?? 0, npcReplacements: extra.npcReplacements ?? 0,
      reconnectAttempts: this.reconnectAttempts, warning: this.warning
    };
  }

  profiles() { return new Map(this.presences); }

  setDebugNetwork(latencyMs: number, lossRate: number) {
    if (!import.meta.env.DEV) return;
    this.debugLatencyMs = Math.max(0, Math.min(2_000, latencyMs));
    this.debugLossRate = Math.max(0, Math.min(0.95, lossRate));
  }

  async forceReconnect() {
    if (!import.meta.env.DEV) return;
    await this.stop(false);
    this.started = false;
    this.disposed = false;
    this.setState('RECONNECTING');
    window.setTimeout(() => { void this.start(this.currentChunk, this.adjacentChunks); }, 500);
  }

  async stop(dispose = true) {
    this.disposed = dispose;
    this.started = false;
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    for (const timer of this.overlapTimers.values()) window.clearTimeout(timer);
    this.overlapTimers.clear();
    if (this.mockChannel) {
      if (this.sessionId) this.sendMock({ type: 'leave', sender: this.sessionId, sessionId: this.sessionId });
      this.mockChannel.close();
      this.mockChannel = undefined;
    }
    if (this.mockSocket) {
      if (this.sessionId) this.sendMock({ type: 'leave', sender: this.sessionId, sessionId: this.sessionId });
      this.mockSocket.close();
      this.mockSocket = undefined;
    }
    if (this.client) {
      await this.reportLocation(dispose ? 'EXIT' : 'CHECKPOINT');
      if (this.sessionId && this.canControl && this.lastVehicle) {
        await this.client.functions.invoke('release-vehicle-control', { body: { version: 1, sessionId: this.sessionId, vehicleId: this.publicVehicleId(this.lastVehicle.vehicleId) } });
      }
      for (const channel of this.channels.values()) await this.client.removeChannel(channel);
      this.channels.clear();
      if (this.presenceChannel) await this.client.removeChannel(this.presenceChannel);
      this.presenceChannel = undefined;
    }
    this.presences.clear();
    this.setState(this.save.onlinePreference === 'solo' ? 'SOLO' : 'OFFLINE');
  }

  private async connectSupabase() {
    if (!this.client || this.disposed) return;
    this.setState(this.reconnectAttempts ? 'RECONNECTING' : 'OFFLINE');
    try {
      let { data: { session } } = await this.client.auth.getSession();
      if (!session) {
        const result = await this.client.auth.signInAnonymously();
        if (result.error) throw result.error;
        session = result.data.session;
        this.save.accountLinkState = 'anonymous';
      } else {
        this.save.accountLinkState = session.user.is_anonymous ? 'anonymous' : 'permanent';
      }
      if (!session) throw new Error('AUTH_SESSION_MISSING');
      await this.client.realtime.setAuth(session.access_token);
      const joinedAt = Date.now();
      const { data, error } = await this.client.functions.invoke('join-online-world', { body: {
        version: 1, worldId: GAME_CONFIG.online.worldId, publicPlayerId: this.save.publicPlayerId,
        driverName: this.save.publicDriverName, avatarId: this.save.publicAvatarId,
        fleetPublicId: this.save.fleetPublicProfile.fleetPublicId, fleetName: this.save.fleetPublicProfile.name,
        fleetTag: this.save.fleetPublicProfile.tag, fleetColor: this.save.fleetPublicProfile.color,
        fleetEmblemId: this.save.fleetPublicProfile.emblemId, chunkId: this.currentChunk,
        authorizedChunks: [this.currentChunk, ...this.adjacentChunks], vehicleId: this.publicVehicleId(this.save.activeVehicleId),
        mapVersion: GAME_CONFIG.mapVersion, protocolVersion: GAME_CONFIG.online.protocolVersion
      }});
      if (error) throw error;
      const response = data as { sessionId?: string; publicPlayerId?: string; serverTime?: string } | null;
      if (!response?.sessionId) throw new Error('JOIN_RESPONSE_INVALID');
      this.sessionId = response.sessionId;
      if (response.publicPlayerId) this.save.publicPlayerId = response.publicPlayerId;
      this.save.lastPublicSessionId = this.sessionId;
      this.save.lastOnlineWorld = GAME_CONFIG.online.worldId;
      this.serverTimeOffset = response.serverTime ? Date.parse(response.serverTime) - Date.now() : 0;
      this.pingMs = Date.now() - joinedAt;
      const lease = await this.client.functions.invoke('claim-vehicle-control', { body: {
        version: 1, sessionId: this.sessionId, vehicleId: this.publicVehicleId(this.save.activeVehicleId), stateVersion: this.activeVehicle()?.stateVersion ?? 1
      }});
      this.canControl = !lease.error && (lease.data as { acquired?: boolean } | null)?.acquired !== false;
      if (!this.canControl) this.warning = 'Este veículo está sendo controlado em outra aba. Você está como espectador.';
      await this.subscribePresence();
      await this.subscribeChunkTopics(this.currentChunk, this.adjacentChunks);
      this.reconnectAttempts = 0;
      this.warning = this.canControl ? null : this.warning;
      this.setState('ONLINE');
      this.startHeartbeat();
    } catch (error) {
      console.warn('Online temporariamente indisponível:', error);
      this.warning = 'Conexão online interrompida. Controle local preservado.';
      this.setState('SOLO_TEMPORARY');
      this.scheduleReconnect();
    }
  }

  private async subscribePresence() {
    if (!this.client || !this.sessionId) return;
    this.presenceChannel = this.client.channel(GAME_CONFIG.online.presenceTopic, {
      config: { private: true, presence: { key: this.sessionId }, broadcast: { self: false, ack: true } }
    });
    this.presenceChannel.on('presence', { event: 'sync' }, () => this.syncSupabasePresence());
    await new Promise<void>((resolve, reject) => {
      this.presenceChannel!.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') { void this.trackPresence().then(resolve, reject); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(error ?? new Error(status));
        if (status === 'CLOSED' && this.state === 'ONLINE') this.handleConnectionLoss();
      });
    });
  }

  private async subscribeChunkTopics(chunkId: string, adjacent: string[]) {
    if (!this.client) return;
    const movementTopics = desiredChunkTopics(chunkId, adjacent);
    const topics = [...movementTopics, ...movementTopics.map((topic) => topic.replace(/:movement$/, ':events'))];
    await Promise.all(topics.filter((topic) => !this.channels.has(topic)).map((topic) => this.subscribeTopic(topic)));
    const desired = new Set(topics);
    for (const topic of [...this.channels.keys()]) {
      if (!desired.has(topic) && !this.overlapTimers.has(topic)) {
        const timer = window.setTimeout(() => { void this.removeTopic(topic); }, GAME_CONFIG.online.chunkOverlapMs);
        this.overlapTimers.set(topic, timer);
      }
    }
  }

  private async subscribeTopic(topic: string) {
    if (!this.client) return;
    const channel = this.client.channel(topic, { config: { private: true, broadcast: { self: false, ack: true } } });
    if (topic.endsWith(':movement')) channel.on('broadcast', { event: 'movement' }, ({ payload }) => this.receiveMovement(payload));
    channel.on('broadcast', { event: 'chunk-transfer' }, () => undefined);
    this.channels.set(topic, channel);
    await new Promise<void>((resolve, reject) => channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') resolve();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(error ?? new Error(status));
      if (status === 'CLOSED' && this.state === 'ONLINE') this.handleConnectionLoss();
    }));
  }

  private async removeTopic(topic: string) {
    const timer = this.overlapTimers.get(topic);
    if (timer) window.clearTimeout(timer);
    this.overlapTimers.delete(topic);
    const channel = this.channels.get(topic);
    if (channel && this.client) await this.client.removeChannel(channel);
    this.channels.delete(topic);
  }

  private publishMovement(state: LocalMovementState, now: number) {
    if (this.state !== 'ONLINE' || !this.sessionId || !this.canControl) return;
    const previousHeading = this.lastHeading.get(state.vehicleId) ?? state.heading;
    const nearestDistance = 0;
    const rate = movementRateHz({
      speedMps: state.speed, headingChange: Math.atan2(Math.sin(state.heading - previousHeading), Math.cos(state.heading - previousHeading)),
      distanceMeters: nearestDistance, visible: true, connectionQuality: this.pingMs === null ? 0.75 : this.pingMs < 100 ? 1 : this.pingMs < 220 ? 0.7 : 0.45,
      stopped: Math.abs(state.speed) < 0.2
    });
    if (!shouldSendMovement(this.lastSentAt.get(state.vehicleId) ?? 0, now, rate, state.importantEvent)) return;
    const local = localPositionForChunk(state.position, this.currentChunk);
    const snapshot: MovementSnapshot = {
      protocolVersion: GAME_CONFIG.online.protocolVersion, sessionId: this.sessionId,
      publicPlayerId: this.save.publicPlayerId, vehicleId: this.publicVehicleId(state.vehicleId),
      sequence: this.sequenceFor(state.vehicleId), serverTimeOffset: this.serverTimeOffset, clientTime: now,
      mapVersion: GAME_CONFIG.mapVersion, chunkId: this.currentChunk, localX: local.x, localY: local.y,
      layer: state.layer ?? 0, heading: state.heading, speed: state.speed, acceleration: state.acceleration,
      vehicleState: state.occupied ? 'occupied' : Math.abs(state.speed) < 0.2 ? 'stopped' : 'free',
      autopilot: state.autopilot, turnSignal: state.turnSignal ?? 'none', braking: state.braking,
      controllerType: state.controllerType, vehicleModel: state.vehicleModel,
      colorId: state.colorId ?? (state.vehicleModel === 'Sedan 2012' ? 'blue' : 'amber'),
      fleetPublicId: this.save.fleetPublicProfile.fleetPublicId
    };
    if (movementPayloadBytes(snapshot) > GAME_CONFIG.online.movementPayloadBytes) return;
    const wire = serializeMovement(snapshot);
    const started = performance.now();
    if (this.mockChannel || this.mockSocket) this.sendMock({ type: 'movement', sender: this.sessionId, payload: wire });
    else {
      const topic = `city:brasilia:chunk:${this.currentChunk}:movement`;
      void this.channels.get(topic)?.send({ type: 'broadcast', event: 'movement', payload: wire }).then(() => {
        this.pingMs = Math.round(this.pingMs === null ? performance.now() - started : this.pingMs * 0.8 + (performance.now() - started) * 0.2);
      });
    }
    this.lastSentAt.set(state.vehicleId, now);
    this.lastHeading.set(state.vehicleId, state.heading);
    this.sentInWindow += 1;
  }

  private receiveMovement(payload: unknown) {
    const snapshot = deserializeMovement(payload);
    if (!snapshot || snapshot.sessionId === this.sessionId) return;
    if (!this.subscribedToChunk(snapshot.chunkId)) return;
    if (this.debugLossRate > 0 && Math.random() < this.debugLossRate) return;
    if (this.debugLatencyMs > 0) {
      window.setTimeout(() => this.deliverMovement(snapshot), this.debugLatencyMs);
      return;
    }
    this.deliverMovement(snapshot);
  }

  private deliverMovement(snapshot: MovementSnapshot) {
    this.receivedInWindow += 1;
    const presence = [...this.presences.values()].find((item) => item.publicPlayerId === snapshot.publicPlayerId);
    for (const listener of this.snapshotListeners) listener(snapshot, presence);
  }

  private async sendEvent(event: string, payload: unknown) {
    if ((this.mockChannel || this.mockSocket) && this.sessionId) { this.sendMock({ type: 'event', sender: this.sessionId, event, payload }); return; }
    const channel = this.channels.get(`city:brasilia:chunk:${this.currentChunk}:events`);
    await channel?.send({ type: 'broadcast', event, payload });
  }

  private async reportLocation(reason: 'REGION' | 'CHECKPOINT' | 'EXIT' | 'DISCONNECT' | 'RIDE') {
    if (!this.client || !this.sessionId || !this.lastVehicle || this.state !== 'ONLINE') return;
    const local = localPositionForChunk(this.lastVehicle.position, this.currentChunk);
    const margin = 80;
    await this.client.functions.invoke('report-player-location', { body: {
      version: 1,
      sessionId: this.sessionId,
      chunkId: this.currentChunk,
      region: this.save.currentRegion,
      localX: Math.max(-margin, Math.min(GAME_CONFIG.map.chunkSizeMeters + margin, local.x)),
      localY: Math.max(-margin, Math.min(GAME_CONFIG.map.chunkSizeMeters + margin, local.y)),
      layer: this.lastVehicle.layer ?? 0,
      heading: this.lastVehicle.heading,
      reason
    }}).catch(() => undefined);
  }

  private startMock() {
    this.sessionId = publicSessionId();
    this.save.lastPublicSessionId = this.sessionId;
    if (typeof WebSocket !== 'undefined' && typeof location !== 'undefined') {
      this.mockSocket = new WebSocket(`ws://${location.hostname}:4175`);
      this.mockSocket.onmessage = (event) => {
        try { this.handleMockMessage(JSON.parse(String(event.data)) as MockMessage); } catch { /* ignore malformed mock packets */ }
      };
      this.mockSocket.onopen = () => {
        this.setState('ONLINE');
        this.broadcastPresence(true);
        this.startHeartbeat();
      };
      this.mockSocket.onerror = () => {
        this.warning = 'Relay local indisponível. A partida continua no modo solo.';
        this.setState('SOLO_TEMPORARY');
      };
      return;
    }
    this.startBroadcastMock();
  }

  private startBroadcastMock() {
    this.mockChannel = new BroadcastChannel(`rbt-online-v${GAME_CONFIG.online.protocolVersion}:${GAME_CONFIG.online.worldId}`);
    this.mockChannel.onmessage = (event: MessageEvent<MockMessage>) => this.handleMockMessage(event.data);
    this.setState('ONLINE');
    this.broadcastPresence(true);
    this.startHeartbeat();
  }

  private handleMockMessage(message: MockMessage) {
    if (!message || message.sender === this.sessionId) return;
    if (message.type === 'movement') this.receiveMovement(message.payload);
    if (message.type === 'leave') { this.presences.delete(message.sessionId); this.emitPresence(); }
    if (message.type === 'presence') {
      this.presences.set(message.presence.sessionId, message.presence);
      this.emitPresence();
      if (message.requestReply) this.broadcastPresence(false);
    }
  }

  private broadcastPresence(requestReply: boolean) {
    if ((!this.mockChannel && !this.mockSocket) || !this.sessionId) return;
    this.sendMock({ type: 'presence', sender: this.sessionId, presence: this.localPresence(), requestReply });
  }

  private sendMock(message: MockMessage) {
    if (this.mockSocket?.readyState === WebSocket.OPEN) this.mockSocket.send(JSON.stringify(message));
    else this.mockChannel?.postMessage(message);
  }

  private async trackPresence() {
    if (!this.presenceChannel) return;
    await this.presenceChannel.track(this.localPresence());
  }

  private syncSupabasePresence() {
    if (!this.presenceChannel) return;
    this.presences.clear();
    const state = this.presenceChannel.presenceState<PublicPresence>();
    for (const entries of Object.values(state)) for (const presence of entries) {
      if (presence.sessionId && presence.sessionId !== this.sessionId) this.presences.set(presence.sessionId, presence);
    }
    this.emitPresence();
  }

  private emitPresence() { for (const listener of this.presenceListeners) listener(new Map(this.presences)); }

  private localPresence(): PublicPresence {
    const active = this.activeVehicle();
    return {
      sessionId: this.sessionId!, publicPlayerId: this.save.publicPlayerId, driverName: this.save.publicDriverName,
      avatarId: this.save.publicAvatarId, fleetPublicId: this.save.fleetPublicProfile.fleetPublicId,
      fleetName: this.save.settings.showFleetNames ? this.save.fleetPublicProfile.name : null,
      fleetColor: this.save.fleetPublicProfile.color, chunkId: this.currentChunk,
      vehicleId: this.publicVehicleId(active?.id ?? this.save.activeVehicleId), vehicleModel: active?.model ?? 'Hatch 1998',
      controllerType: 'PLAYER', status: Math.abs(this.lastVehicle?.speed ?? 0) > 0.2 ? 'driving' : 'idle',
      joinedAt: new Date().toISOString()
    };
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      if (this.mockChannel || this.mockSocket) this.broadcastPresence(false);
      else if (this.client && this.sessionId) {
        void this.trackPresence();
        void this.client.functions.invoke('online-heartbeat', { body: {
          version: 1, sessionId: this.sessionId, vehicleId: this.publicVehicleId(this.lastVehicle?.vehicleId ?? this.save.activeVehicleId),
          chunkId: this.currentChunk, authorizedChunks: [this.currentChunk, ...this.adjacentChunks],
          stateVersion: this.activeVehicle()?.stateVersion ?? 1
        }}).then(({ error }) => { if (error) this.handleConnectionLoss(); });
      }
    }, GAME_CONFIG.online.heartbeatMs);
  }

  private handleConnectionLoss() {
    if (this.state === 'RECONNECTING' || this.disposed) return;
    this.warning = 'Reconectando sem interromper a direção.';
    this.setState('RECONNECTING');
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.disposed || !this.client || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(5, this.reconnectAttempts - 1));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.resetSupabaseChannels().then(() => this.connectSupabase());
    }, delay);
  }

  private async resetSupabaseChannels() {
    if (!this.client) return;
    for (const channel of this.channels.values()) await this.client.removeChannel(channel);
    this.channels.clear();
    if (this.presenceChannel) await this.client.removeChannel(this.presenceChannel);
    this.presenceChannel = undefined;
  }

  private setState(state: OnlineConnectionState) {
    this.state = state;
    for (const listener of this.connectionListeners) listener(state);
  }

  private subscribedToChunk(chunkId: string) { return chunkId === this.currentChunk || this.adjacentChunks.includes(chunkId); }
  private activeVehicle() { return this.save.fleet.vehicles.find((vehicle) => vehicle.id === this.save.activeVehicleId); }
  private publicVehicleId(localVehicleId: string) { return `${this.save.publicPlayerId}__${localVehicleId}`.slice(0, 64); }
  private sequenceFor(vehicleId: string) { const next = (this.sequences.get(vehicleId) ?? 0) + 1; this.sequences.set(vehicleId, next); return next; }
  private rollRates() {
    const elapsed = (Date.now() - this.rateWindowStarted) / 1_000;
    if (elapsed < 1) return;
    this.sendRateHz = Math.round(this.sentInWindow / elapsed * 10) / 10;
    this.receiveRateHz = Math.round(this.receivedInWindow / elapsed * 10) / 10;
    this.sentInWindow = 0; this.receivedInWindow = 0; this.rateWindowStarted = Date.now();
  }
}

function mockTransportRequested() {
  return import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('onlineTransport') === 'mock';
}

function publicSessionId() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replaceAll('-', '') : Math.random().toString(36).slice(2);
  return `rbs_${random.slice(0, 24)}`;
}
