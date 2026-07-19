import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import type { OnlineHudSnapshot, PlayerSettings, Point } from '../types/game';
import { createFleetVehicleVisual, setVehicleLighting } from '../game/entities/VehicleVisual';
import type { PriorityTrafficVehicle, TrafficSystem } from '../game/traffic/TrafficSystem';
import { interestLevel } from './adaptiveRate';
import { RemoteInterpolationBuffer } from './interpolation';
import type { PublicPresence } from './OnlineWorldClient';
import { validateMovement, type MovementSnapshot } from './protocol';

type Project = (point: Point) => Point;
type RemoteEntry = {
  snapshot: MovementSnapshot;
  presence?: PublicPresence;
  buffer: RemoteInterpolationBuffer;
  visual: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  receivedAt: number;
  invalidPackets: number;
  currentPosition: Point;
  currentHeading: number;
};

export class RemoteVehicleSystem {
  private readonly remotes = new Map<string, RemoteEntry>();
  private profiles = new Map<string, PublicPresence>();
  private collisionCooldownUntil = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly traffic: TrafficSystem, private readonly project: Project) {}

  updateProfiles(profiles: Map<string, PublicPresence>) {
    this.profiles = new Map(profiles);
    for (const [vehicleId, remote] of this.remotes) {
      const profile = [...profiles.values()].find((item) => item.publicPlayerId === remote.snapshot.publicPlayerId);
      if (!profile && remote.presence) { this.destroyEntry(vehicleId, remote); continue; }
      remote.presence = profile;
    }
  }

  receive(snapshot: MovementSnapshot, presence?: PublicPresence) {
    let remote = this.remotes.get(snapshot.vehicleId);
    const validation = validateMovement(snapshot, remote?.buffer.latest ?? undefined, remote?.snapshot.vehicleId);
    if (!validation.valid) {
      if (remote) remote.invalidPackets += 1;
      return false;
    }
    if (!remote) {
      const visual = this.createVisual(snapshot);
      const label = this.createLabel(snapshot);
      const position = { ...this.worldPosition(snapshot) };
      remote = { snapshot, presence, buffer: new RemoteInterpolationBuffer(), visual, label, receivedAt: Date.now(), invalidPackets: 0, currentPosition: position, currentHeading: snapshot.heading };
      this.remotes.set(snapshot.vehicleId, remote);
    }
    remote.snapshot = snapshot;
    remote.presence = presence ?? this.profileFor(snapshot.publicPlayerId);
    remote.receivedAt = Date.now();
    return remote.buffer.push(snapshot);
  }

  update(now: number, localPosition: Point, settings: PlayerSettings, headlightIntensity = 0) {
    const priorities: PriorityTrafficVehicle[] = [];
    let visible = 0;
    for (const [vehicleId, remote] of this.remotes) {
      if (now - remote.receivedAt > GAME_CONFIG.online.removeAfterMs) { this.destroyEntry(vehicleId, remote); continue; }
      const state = remote.buffer.sample(now);
      if (!state) continue;
      remote.currentPosition = state.position;
      remote.currentHeading = state.heading;
      const distance = Math.hypot(state.position.x - localPosition.x, state.position.y - localPosition.y);
      const interest = interestLevel(distance);
      const shouldRender = interest !== 'OUTSIDE' && visible < settings.onlineVisualLimit;
      remote.visual.setVisible(shouldRender);
      remote.label.setVisible(shouldRender && settings.showPlayerNames && (interest === 'NEAR' || interest === 'MEDIUM'));
      if (!shouldRender) continue;
      visible += 1;
      const projected = this.project(state.position);
      const projectedAhead = this.project({ x: state.position.x + Math.cos(state.heading), y: state.position.y + Math.sin(state.heading) });
      remote.visual.setPosition(projected.x, projected.y).setRotation(Math.atan2(projectedAhead.y - projected.y, projectedAhead.x - projected.x));
      setVehicleLighting(remote.visual, headlightIntensity, remote.snapshot.braking, settings.reducedWorldEffects);
      remote.visual.setAlpha(state.stale ? 0.55 : 1).setScale(interest === 'NEAR' ? 0.78 : interest === 'MEDIUM' ? 0.65 : 0.48);
      this.placeLabel(remote, projected, settings, interest);
      if (interest === 'NEAR' || interest === 'MEDIUM') priorities.push({ id: `online-${vehicleId}`, position: state.position, heading: state.heading, speed: state.speed });
    }
    this.traffic.setOnlineReservedSlots(visible);
    this.traffic.setOnlinePriorityVehicles(priorities);
  }

  handlePlayerCollision(position: Point, speed: number, now = Date.now()) {
    if (now < this.collisionCooldownUntil) return { impact: false, retainedSpeed: 1, incidentId: null as string | null };
    for (const remote of this.remotes.values()) {
      if (Math.hypot(position.x - remote.currentPosition.x, position.y - remote.currentPosition.y) >= 4.6) continue;
      this.collisionCooldownUntil = now + 1_200;
      return { impact: true, retainedSpeed: Math.abs(speed) > 3 ? 0.42 : 0.7, incidentId: `inc_${crypto.randomUUID?.() ?? Date.now()}` };
    }
    return { impact: false, retainedSpeed: 1, incidentId: null as string | null };
  }

  telemetry(): Pick<OnlineHudSnapshot, 'nearbyPlayers' | 'remoteEmployees' | 'interpolationBuffer' | 'extrapolating' | 'lostPackets' | 'outOfOrderPackets' | 'npcReplacements'> {
    let nearbyPlayers = 0, remoteEmployees = 0, interpolationBuffer = 0, extrapolating = 0, lostPackets = 0, outOfOrderPackets = 0;
    const now = Date.now();
    for (const remote of this.remotes.values()) {
      if (remote.snapshot.controllerType === 'EMPLOYEE') remoteEmployees += 1; else if (remote.snapshot.controllerType === 'PLAYER') nearbyPlayers += 1;
      interpolationBuffer += remote.buffer.size;
      lostPackets += remote.buffer.lost;
      outOfOrderPackets += remote.buffer.outOfOrder;
      if (remote.buffer.sample(now)?.extrapolating) extrapolating += 1;
    }
    return { nearbyPlayers, remoteEmployees, interpolationBuffer, extrapolating, lostPackets, outOfOrderPackets, npcReplacements: this.remotes.size };
  }

  count() { return this.remotes.size; }

  injectFake(position: Point, index = this.remotes.size + 1) {
    if (!import.meta.env.DEV) return;
    const chunkX = Math.floor(position.x / GAME_CONFIG.map.chunkSizeMeters);
    const chunkY = Math.floor(position.y / GAME_CONFIG.map.chunkSizeMeters);
    const publicPlayerId = `rbp_fake${String(index).padStart(4, '0')}`;
    this.receive({
      protocolVersion: 1, sessionId: `rbs_fake${String(index).padStart(4, '0')}`, publicPlayerId,
      vehicleId: `${publicPlayerId}__vehicle-fake`, sequence: 1, serverTimeOffset: 0, clientTime: Date.now(),
      mapVersion: GAME_CONFIG.mapVersion, chunkId: `${chunkX}_${chunkY}`,
      localX: position.x - chunkX * GAME_CONFIG.map.chunkSizeMeters + 18 + index * 3,
      localY: position.y - chunkY * GAME_CONFIG.map.chunkSizeMeters + 8,
      layer: 0, heading: 0, speed: 0, acceleration: 0, vehicleState: 'stopped', autopilot: false,
      turnSignal: 'none', braking: true, controllerType: 'PLAYER', vehicleModel: index % 2 ? 'Hatch 1998' : 'Sedan 2012',
      colorId: index % 2 ? 'violet' : 'blue', fleetPublicId: null
    }, { sessionId: `rbs_fake${String(index).padStart(4, '0')}`, publicPlayerId, driverName: `Jogador ${index}`, avatarId: 'driver-violet', fleetPublicId: null, fleetName: null, fleetColor: null, regionId: 'centro', chunkId: `${chunkX}_${chunkY}`, vehicleId: `${publicPlayerId}__vehicle-fake`, vehicleModel: index % 2 ? 'Hatch 1998' : 'Sedan 2012', controllerType: 'PLAYER', status: 'idle', joinedAt: new Date().toISOString() });
  }

  clear() {
    for (const [id, remote] of this.remotes) this.destroyEntry(id, remote);
    this.traffic.setOnlineReservedSlots(0);
    this.traffic.setOnlinePriorityVehicles([]);
  }

  destroy() { this.clear(); }

  private createVisual(snapshot: MovementSnapshot) {
    const colors = { amber: 0xc97732, blue: 0x4f86d9, green: 0x39a879, violet: 0x8e6bbf, taxi: 0xf1cc45 } as const;
    return createFleetVehicleVisual(this.scene, snapshot.vehicleModel, colors[snapshot.colorId] ?? colors.amber, snapshot.colorId === 'taxi').setScale(0.78).setDepth(31);
  }

  private createLabel(snapshot: MovementSnapshot) {
    const employee = snapshot.controllerType === 'EMPLOYEE';
    return this.scene.add.text(0, 0, employee ? 'Motorista' : 'Jogador', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: employee ? '#b7f7df' : '#dcecff',
      backgroundColor: employee ? '#114a3bdd' : '#15365bdd', padding: { x: 5, y: 3 }, align: 'center'
    }).setOrigin(0.5, 1).setDepth(1_200);
  }

  private placeLabel(remote: RemoteEntry, projected: Point, settings: PlayerSettings, interest: ReturnType<typeof interestLevel>) {
    const camera = this.scene.cameras.main;
    const inverseZoom = 1 / Math.max(0.1, camera.zoom);
    const rotation = (camera as unknown as { rotation: number }).rotation;
    const offset = 18 * inverseZoom;
    const profile = remote.presence ?? this.profileFor(remote.snapshot.publicPlayerId);
    const base = remote.snapshot.controllerType === 'EMPLOYEE' ? `Motorista ${profile?.driverName ?? ''}`.trim() : profile?.driverName ?? 'Jogador';
    const fleet = settings.showFleetNames && profile?.fleetName ? `\n${profile.fleetName}` : '';
    remote.label.setText(base + fleet).setFontSize(interest === 'NEAR' ? 11 : 9)
      .setPosition(projected.x - Math.sin(rotation) * offset, projected.y - Math.cos(rotation) * offset)
      .setRotation(-rotation).setScale(inverseZoom);
  }

  private profileFor(publicPlayerId: string) { return [...this.profiles.values()].find((profile) => profile.publicPlayerId === publicPlayerId); }
  private worldPosition(snapshot: MovementSnapshot) { const [x, y] = snapshot.chunkId.split('_').map(Number); return { x: x * GAME_CONFIG.map.chunkSizeMeters + snapshot.localX, y: y * GAME_CONFIG.map.chunkSizeMeters + snapshot.localY }; }
  private destroyEntry(vehicleId: string, remote: RemoteEntry) { remote.visual.destroy(); remote.label.destroy(); this.remotes.delete(vehicleId); }
}
