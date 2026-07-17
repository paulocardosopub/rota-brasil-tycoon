import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { directionalLaneCount, isDrivableRoad, pointInTrafficLane } from '../../map/routing/roadRules';
import type { CollisionSeverity, GraphEdge, GraphNode, MapSignal, NavigationGraph, Point, RoadData, TrafficDensity, TrafficVehicleState } from '../../types/game';
import { createBusVisual, createCarVisual, createUtilityVehicleVisual } from '../entities/VehicleVisual';
import { distanceAhead, distanceAlongRoute, impactMetrics, pathsConflict, pointOverlapsVehicle, sweptPointOverlapsVehicle, yieldingPathsConflict } from './TrafficPhysics';
import { selectMergeOwner } from './TrafficMerge';
import { RecklessRecovery } from './RecklessRecovery';

type Project = (point: Point) => Point;
type SignalState = 'green' | 'yellow' | 'red';
type VehicleKind = 'car' | 'taxi' | 'bus' | 'utility';

type TrafficVehicle = {
  visual?: Phaser.GameObjects.Container;
  position: Point;
  targetPosition: Point;
  current: GraphNode;
  target: GraphNode;
  edge: GraphEdge;
  previousId: string;
  recentNodeIds: string[];
  speed: number;
  heading: number;
  index: number;
  laneIndex: number;
  kind: VehicleKind;
  length: number;
  width: number;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  contactWithPlayer: boolean;
  stunnedUntil: number;
  ghostWithPlayerUntil: number;
  headOnDeadlockSeconds: number;
  mergeWaitSeconds: number;
  recovery: RecklessRecovery;
  state: TrafficVehicleState;
  stopReason: 'clear' | 'signal' | 'traffic' | 'player' | 'collision';
  color: number;
};

export type PlayerCollisionResult = {
  impact: boolean;
  autopilotRecovery: boolean;
  severity: CollisionSeverity | null;
  relativeSpeedKmh: number;
  conditionDamage: number;
  retainedSpeed: number;
  resolvedPosition: Point | null;
};
export type TrafficUpdateResult = { autopilotDeadlockRecovery: boolean };

export type AutoBrakeReason = 'clear' | 'traffic' | 'red-signal';
export type PriorityTrafficVehicle = { id: string; position: Point; heading: number; speed: number; reckless?: boolean };

const MAJOR_ROADS = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary']);
const RECKLESS_RECOVERY_OPTIONS = {
  thresholdSeconds: GAME_CONFIG.traffic.autopilotFollowingDeadlockSeconds,
  maximumSeconds: GAME_CONFIG.traffic.stuckRecoveryMaximumSeconds,
  escapeDistanceMeters: GAME_CONFIG.traffic.stuckRecoveryEscapeDistanceMeters
};

export class TrafficSystem {
  enabled = true;
  signalsEnabled = true;
  timeScale = 1;
  private elapsed = 0;
  private readonly nodes = new Map<string, GraphNode>();
  private readonly roads = new Map<string, RoadData>();
  private readonly signalByNode = new Map<string, MapSignal>();
  private readonly signalIndex = new Map<string, number>();
  private readonly nodesBySource = new Map<string, GraphNode[]>();
  private readonly laneGraph: boolean;
  private signals: MapSignal[] = [];
  private readonly vehicles: TrafficVehicle[] = [];
  private lastViolationCycle = -1;
  private collisionActive = false;
  private collisionCooldownUntil = 0;
  private playerBrakeReason: AutoBrakeReason = 'clear';
  private deadlockRecoveries = 0;
  private readonly playerRecovery = new RecklessRecovery(RECKLESS_RECOVERY_OPTIONS);
  private activeVehicleLimit = Number.POSITIVE_INFINITY;
  private requestedVehicleLimit = Number.POSITIVE_INFINITY;
  private reservedSlots = 0;
  private fleetReservedSlots = 0;
  private onlineReservedSlots = 0;
  private fleetPriorityVehicles: PriorityTrafficVehicle[] = [];
  private onlinePriorityVehicles: PriorityTrafficVehicle[] = [];
  private priorityVehicles: PriorityTrafficVehicle[] = [];
  private signalOverride: SignalState | null = null;
  private readonly spatialVehicles = new Map<string, TrafficVehicle[]>();
  private readonly mergeOwnerByNode = new Map<string, number>();
  private pendingUpdateSeconds = 0;
  private readonly crowdGraphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    graph: NavigationGraph,
    roads: RoadData[],
    signals: MapSignal[],
    private readonly project: Project,
    spawn: Point
  ) {
    this.laneGraph = graph.kind === 'lane';
    this.crowdGraphics = scene.add.graphics().setDepth(23);
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
      if (node.sourceNodeId) {
        const sourceNodes = this.nodesBySource.get(node.sourceNodeId) ?? [];
        sourceNodes.push(node);
        this.nodesBySource.set(node.sourceNodeId, sourceNodes);
      }
    }
    for (const road of roads) this.roads.set(road.id, road);
    this.setSignals(signals);

    const candidates = graph.nodes.filter((node) => {
      const distance = Math.hypot(node.x - spawn.x, node.y - spawn.y);
      return distance > 55 && distance < 700 && this.validEdges(node).length > 0;
    });
    if (!candidates.length) return;

    const carCount = GAME_CONFIG.traffic.npcVehicleCount;
    const busCount = GAME_CONFIG.traffic.npcBusCount;
    const utilityCount = GAME_CONFIG.traffic.npcUtilityCount;
    const total = carCount + busCount + utilityCount;
    const colors = [0x5b8def, 0xe85d75, 0xf3b33d, 0x8e6bbf, 0x42a66c, 0xe6e9ee, 0x3d526d, 0xd9843b, 0x2f8d91, 0xb14d4d];

    for (let index = 0; index < total; index += 1) {
      const kind: VehicleKind = index >= carCount + busCount
        ? 'utility'
        : index >= carCount
          ? 'bus'
          : index % 7 === 0 ? 'taxi' : 'car';
      const preferred = kind === 'bus'
        ? candidates.filter((node) => this.validEdges(node, true).length > 0)
        : candidates;
      const pool = preferred.length ? preferred : candidates;
      const current = pool[(index * 197 + 41) % pool.length];
      const choices = this.validEdges(current, kind === 'bus');
      const edge = choices[(index * 13 + 3) % choices.length];
      const target = this.nodes.get(edge.to);
      if (!target) continue;
      const road = this.roads.get(edge.roadId);
      const laneIndex = kind === 'bus' ? 0 : index % Math.max(1, Math.ceil((road?.lanes ?? 1) / (road?.oneway ? 1 : 2)));
      const position = this.laneGraph ? { x: current.x, y: current.y } : pointInTrafficLane(current, current, target, road, laneIndex);
      const targetPosition = this.laneGraph ? { x: target.x, y: target.y } : pointInTrafficLane(target, current, target, road, laneIndex);
      const spec = vehicleSpec(kind, index);
      const color = kind === 'bus' ? (index % 2 ? 0x2b7a78 : 0xc44d36)
        : kind === 'utility' ? (index % 2 ? 0xe8ecef : 0x7c8f9e)
          : kind === 'taxi' ? 0xf2c744 : colors[index % colors.length];
      // Mantém todos os 72 veículos simulados e visíveis. Os mais próximos
      // usam containers detalhados; os demais entram no lote gráfico único.
      const detailed = index < 28 || (kind === 'bus' && index < carCount + 6) || (kind === 'utility' && index < carCount + busCount + 4);
      const visual = detailed
        ? kind === 'bus'
          ? createBusVisual(scene, color).setScale(0.64)
          : kind === 'utility'
            ? createUtilityVehicleVisual(scene, color).setScale(0.68)
            : createCarVisual(scene, color).setScale(0.68)
        : undefined;
      visual?.setDepth(24);
      this.vehicles.push({
        visual,
        position,
        targetPosition,
        current,
        target,
        edge,
        previousId: current.id,
        recentNodeIds: [current.id],
        speed: 0,
        heading: Math.atan2(targetPosition.y - position.y, targetPosition.x - position.x),
        index,
        laneIndex,
        kind,
        contactWithPlayer: false,
        stunnedUntil: 0,
        ghostWithPlayerUntil: 0,
        headOnDeadlockSeconds: 0,
        mergeWaitSeconds: 0,
        recovery: new RecklessRecovery(RECKLESS_RECOVERY_OPTIONS),
        state: 'cruising',
        stopReason: 'clear',
        color,
        ...spec
      });
    }
  }

  updateMap(roads: RoadData[], signals: MapSignal[], playerPosition: Point) {
    this.roads.clear();
    for (const road of roads) this.roads.set(road.id, road);
    this.setSignals(signals);
    const candidates = [...this.nodes.values()].filter((node) => {
      const distance = Math.hypot(node.x - playerPosition.x, node.y - playerPosition.y);
      return distance > 60 && distance < 720 && this.validEdges(node).length > 0;
    });
    if (!candidates.length) return;
    for (const vehicle of this.vehicles) {
      if (Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.y - playerPosition.y) < 850) continue;
      const current = candidates[(vehicle.index * 197 + Math.floor(this.elapsed)) % candidates.length];
      const choices = this.validEdges(current, vehicle.kind === 'bus');
      const edge = choices[(vehicle.index * 13 + 3) % choices.length];
      const target = this.nodes.get(edge.to);
      if (!target) continue;
      vehicle.current = current;
      vehicle.target = target;
      vehicle.edge = edge;
      vehicle.previousId = current.id;
      vehicle.recentNodeIds = [current.id];
      vehicle.position = this.laneGraph ? { x: current.x, y: current.y } : pointInTrafficLane(current, current, target, this.roads.get(edge.roadId), vehicle.laneIndex);
      vehicle.targetPosition = this.laneGraph ? { x: target.x, y: target.y } : pointInTrafficLane(target, current, target, this.roads.get(edge.roadId), vehicle.laneIndex);
      vehicle.heading = Math.atan2(vehicle.targetPosition.y - vehicle.position.y, vehicle.targetPosition.x - vehicle.position.x);
      vehicle.speed = 0;
      vehicle.recovery.reset();
    }
  }

  update(deltaSeconds: number, playerPosition: Point, playerSpeed = 0, playerHeading = 0, autopilotEnabled = false): TrafficUpdateResult {
    let autopilotDeadlockRecovery = false;
    if (!this.enabled) {
      for (const vehicle of this.vehicles) vehicle.visual?.setVisible(false);
      this.crowdGraphics.clear();
      return { autopilotDeadlockRecovery };
    }
    this.pendingUpdateSeconds += deltaSeconds;
    if (this.pendingUpdateSeconds < 0.1) return { autopilotDeadlockRecovery };
    deltaSeconds = Math.min(0.2, this.pendingUpdateSeconds);
    this.pendingUpdateSeconds = 0;
    this.elapsed += deltaSeconds * this.timeScale;
    this.crowdGraphics.clear();
    this.rebuildSpatialIndex();
    for (const vehicle of this.vehicles) {
      if (vehicle.index >= this.activeVehicleLimit) {
        vehicle.visual?.setVisible(false);
        continue;
      }
      const distanceFromPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.y - playerPosition.y);
      vehicle.visual?.setVisible(distanceFromPlayer < 520);
      if (distanceFromPlayer > 520 && (Math.floor(this.elapsed * 10) + vehicle.index) % 5 !== 0) continue;

      const dx = vehicle.targetPosition.x - vehicle.position.x;
      const dy = vehicle.targetPosition.y - vehicle.position.y;
      const remaining = Math.hypot(dx, dy);
      const travelHeading = remaining > 0.01 ? Math.atan2(dy, dx) : vehicle.heading;
      const reckless = vehicle.recovery.active;
      let desiredSpeed = vehicle.maxSpeed;
      let stopBeforeTarget = false;
      vehicle.state = this.elapsed < vehicle.ghostWithPlayerUntil ? 'recovering' : 'cruising';
      vehicle.stopReason = 'clear';
      const signal = this.signalByNode.get(vehicle.target.id);
      if (signal) {
        const state = this.signalState(signal);
        const brakingDistance = vehicle.speed * vehicle.speed / (2 * vehicle.braking) + 6;
        const shouldStop = state === 'red' || (state === 'yellow' && remaining > Math.max(5, brakingDistance * 0.72));
        if (shouldStop && remaining < brakingDistance + 8) {
          desiredSpeed = 0;
          stopBeforeTarget = true;
          vehicle.state = 'stopped-signal';
          vehicle.stopReason = 'signal';
        }
      }

      const narrowingMerge = this.isNarrowingMerge(vehicle);
      const ghostingPlayer = this.elapsed < vehicle.ghostWithPlayerUntil || reckless;
      if (!reckless) {
        const leadGap = this.nearestLeadGap(vehicle, travelHeading);
        if (leadGap < 32) {
          const safeGap = narrowingMerge
            ? Math.max(4.5, GAME_CONFIG.traffic.safetyDistanceMeters * 0.55) + vehicle.length * 0.25
            : GAME_CONFIG.traffic.safetyDistanceMeters + vehicle.length * 0.45;
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (leadGap - safeGap) * 0.72));
          vehicle.state = desiredSpeed < 0.4 ? 'stopped-traffic' : 'following';
          vehicle.stopReason = 'traffic';
        }
        if (!ghostingPlayer) {
          const playerGap = distanceAhead(vehicle.position, travelHeading, playerPosition, 3.4);
          if (playerGap !== null && playerGap < 38) {
            desiredSpeed = Math.min(desiredSpeed, Math.max(0, (playerGap - 10) * 0.55));
            vehicle.state = desiredSpeed < 0.4 ? 'stopped-traffic' : 'following';
            vehicle.stopReason = 'player';
          }
          if (yieldingPathsConflict(
            { position: vehicle.position, heading: travelHeading, speed: vehicle.speed },
            { position: playerPosition, heading: playerHeading, speed: playerSpeed },
            3,
            3.8
          )) {
            desiredSpeed = 0;
            vehicle.state = 'stopped-traffic';
            vehicle.stopReason = 'player';
          }
        }

        const hasMergePriority = !narrowingMerge || this.hasNodeEntryPriority(vehicle, remaining);
        if (!hasMergePriority && remaining < 18) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (remaining - 8) * 0.55));
          stopBeforeTarget = remaining <= 8.5;
          vehicle.state = desiredSpeed < 0.4 ? 'stopped-traffic' : 'following';
          vehicle.stopReason = 'traffic';
          vehicle.mergeWaitSeconds += deltaSeconds;
        } else if (!narrowingMerge) vehicle.mergeWaitSeconds = 0;
        for (const priority of this.priorityVehicles) {
          if (priority.reckless) continue;
          const gap = distanceAhead(vehicle.position, travelHeading, priority.position, 3.4);
          if (gap !== null && gap < 38) {
            desiredSpeed = Math.min(desiredSpeed, Math.max(0, (gap - 10) * 0.55));
            vehicle.state = desiredSpeed < 0.4 ? 'stopped-traffic' : 'following';
            vehicle.stopReason = 'traffic';
          }
          if (yieldingPathsConflict(
            { position: vehicle.position, heading: travelHeading, speed: vehicle.speed },
            { position: priority.position, heading: priority.heading, speed: priority.speed },
            3,
            3.8
          )) {
            desiredSpeed = 0;
            vehicle.state = 'stopped-traffic';
            vehicle.stopReason = 'traffic';
          }
        }
        if (this.hasIntersectionConflict(vehicle, travelHeading)) {
          desiredSpeed = 0;
          vehicle.state = 'stopped-traffic';
          vehicle.stopReason = 'traffic';
        }
        if ((!ghostingPlayer && vehicle.contactWithPlayer) || this.elapsed < vehicle.stunnedUntil) {
          desiredSpeed = 0;
          vehicle.state = 'stunned';
          vehicle.stopReason = 'collision';
        }
      } else if (vehicle.stopReason !== 'signal') {
        desiredSpeed = Math.min(vehicle.maxSpeed, Math.max(desiredSpeed, GAME_CONFIG.traffic.stuckRecoverySpeedMps));
        stopBeforeTarget = false;
        vehicle.state = 'recovering';
        vehicle.stopReason = 'clear';
        vehicle.contactWithPlayer = false;
        vehicle.stunnedUntil = 0;
        vehicle.ghostWithPlayerUntil = Math.max(vehicle.ghostWithPlayerUntil, this.elapsed + 0.2);
      }

      const headOnGap = distanceAhead(playerPosition, playerHeading, vehicle.position, 4.2);
      const headOnDistance = Math.hypot(
        vehicle.position.x - playerPosition.x,
        vehicle.position.y - playerPosition.y
      );
      const headOnDeadlock = autopilotEnabled
        && !ghostingPlayer
        && headOnDistance < 14
        && (headOnGap !== null || headOnDistance < 11)
        && Math.cos(vehicle.heading - playerHeading) < -0.25;
      vehicle.headOnDeadlockSeconds = headOnDeadlock ? vehicle.headOnDeadlockSeconds + deltaSeconds : 0;
      if (vehicle.headOnDeadlockSeconds >= GAME_CONFIG.traffic.autopilotHeadOnDeadlockSeconds) {
        vehicle.headOnDeadlockSeconds = 0;
        vehicle.ghostWithPlayerUntil = this.elapsed + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
        vehicle.contactWithPlayer = false;
        vehicle.speed = Math.max(vehicle.speed, 2.4);
        this.deadlockRecoveries += 1;
        autopilotDeadlockRecovery = true;
      }

      const rate = desiredSpeed < vehicle.speed ? vehicle.braking : vehicle.acceleration;
      if (desiredSpeed + 0.4 < vehicle.speed && vehicle.state === 'cruising') vehicle.state = 'braking';
      vehicle.speed += clamp(desiredSpeed - vehicle.speed, -rate * deltaSeconds, rate * deltaSeconds);
      if (stopBeforeTarget && remaining <= 6.2) vehicle.speed = 0;

      const movementStart = { ...vehicle.position };
      const stoppedByCongestion = !reckless
        && desiredSpeed < 0.4
        && Math.abs(vehicle.speed) < 0.45
        && (vehicle.stopReason === 'traffic' || vehicle.stopReason === 'player' || vehicle.stopReason === 'collision');
      const step = vehicle.speed * deltaSeconds;
      if (!stopBeforeTarget && remaining <= Math.max(0.8, step)) {
        vehicle.position = { ...vehicle.targetPosition };
        this.advanceVehicle(vehicle);
      } else if (remaining > 0 && step > 0) {
        const allowedStep = stopBeforeTarget ? Math.min(step, Math.max(0, remaining - 6)) : Math.min(step, remaining);
        vehicle.position.x += dx / remaining * allowedStep;
        vehicle.position.y += dy / remaining * allowedStep;
      }
      const moved = Math.hypot(vehicle.position.x - movementStart.x, vehicle.position.y - movementStart.y);
      const stoppedByMovementBug = !reckless
        && vehicle.stopReason === 'clear'
        && desiredSpeed > 1
        && Math.abs(vehicle.speed) < 0.45
        && moved < 0.01;
      const recoveryUpdate = vehicle.recovery.update({
        deltaSeconds,
        blocked: stoppedByCongestion || stoppedByMovementBug,
        travelledMeters: moved
      });
      if (recoveryUpdate.started) this.activateVehicleRecovery(vehicle, true);

      const nextHeading = Math.atan2(vehicle.targetPosition.y - vehicle.position.y, vehicle.targetPosition.x - vehicle.position.x);
      vehicle.heading = rotateTowards(vehicle.heading, nextHeading, 2.8 * deltaSeconds);
      const projected = this.project(vehicle.position);
      if (vehicle.visual) vehicle.visual.setPosition(projected.x, projected.y).setRotation(projectedHeading(this.project, vehicle.position, vehicle.heading));
      else if (distanceFromPlayer < 520) this.drawCrowdVehicle(vehicle, projected);
    }
    return { autopilotDeadlockRecovery };
  }

  releaseBlockingVehicle(position: Point, heading: number) {
    const blocker = this.findAutopilotBlocker(position, heading);
    if (!blocker) return false;
    if (!blocker.recovery.start()) return false;
    this.activateVehicleRecovery(blocker, true);
    return true;
  }

  updatePlayerRecovery(deltaSeconds: number, blocked: boolean, travelledMeters: number, position: Point, heading: number) {
    const update = this.playerRecovery.update({ deltaSeconds, blocked, travelledMeters });
    if (update.started) {
      this.deadlockRecoveries += 1;
      this.releaseBlockingVehicle(position, heading);
    }
    return update;
  }

  resetPlayerRecovery() {
    this.playerRecovery.reset();
  }

  playerRecoveryActive() {
    return this.playerRecovery.active;
  }

  private activateVehicleRecovery(blocker: TrafficVehicle, countRecovery: boolean) {
    blocker.contactWithPlayer = false;
    blocker.stunnedUntil = 0;
    blocker.ghostWithPlayerUntil = this.elapsed + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
    blocker.speed = Math.max(blocker.speed, GAME_CONFIG.traffic.stuckRecoverySpeedMps * 0.55);
    blocker.state = 'recovering';
    blocker.stopReason = 'clear';
    if (this.mergeOwnerByNode.get(blocker.target.id) === blocker.index) this.mergeOwnerByNode.delete(blocker.target.id);
    if (countRecovery) this.deadlockRecoveries += 1;
    return true;
  }

  private findAutopilotBlocker(playerPosition: Point, playerHeading: number) {
    let best: TrafficVehicle | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const vehicle of this.vehicles) {
      if (vehicle.index >= this.activeVehicleLimit || this.elapsed < vehicle.ghostWithPlayerUntil || vehicle.recovery.active) continue;
      const gap = distanceAhead(playerPosition, playerHeading, vehicle.position, 4.2);
      const crossing = yieldingPathsConflict(
        { position: playerPosition, heading: playerHeading, speed: 0 },
        { position: vehicle.position, heading: vehicle.heading, speed: vehicle.speed },
        3,
        4
      );
      const distance = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.y - playerPosition.y);
      const effectiveGap = gap ?? (crossing && distance < 15 ? distance : null);
      if (effectiveGap !== null && effectiveGap < 24 && effectiveGap < bestGap) {
        best = vehicle;
        bestGap = effectiveGap;
      }
    }
    return best;
  }

  signalState(signal: MapSignal): SignalState {
    if (!this.signalsEnabled) return 'green';
    if (this.signalOverride) return this.signalOverride;
    const { greenSeconds, yellowSeconds, allRedSeconds } = GAME_CONFIG.traffic.signal;
    const phaseLength = greenSeconds + yellowSeconds + allRedSeconds;
    const index = this.signalIndex.get(signal.id) ?? 0;
    const groupOffset = index % 2 ? phaseLength : 0;
    const phase = (this.elapsed + groupOffset) % (phaseLength * 2);
    if (phase < greenSeconds) return 'green';
    if (phase < greenSeconds + yellowSeconds) return 'yellow';
    return 'red';
  }

  checkPlayerRedLight(previousPosition: Point, position: Point, speedMps: number) {
    if (speedMps < 2 || !this.signalsEnabled || Math.hypot(position.x - previousPosition.x, position.y - previousPosition.y) < 0.08) return false;
    const cycle = Math.floor(this.elapsed / 3);
    if (cycle === this.lastViolationCycle) return false;
    for (const signal of this.signals) {
      const previousDistance = Math.hypot(previousPosition.x - signal.x, previousPosition.y - signal.y);
      const currentDistance = Math.hypot(position.x - signal.x, position.y - signal.y);
      if (
        this.signalState(signal) === 'red'
        && currentDistance <= previousDistance
        && distanceToSegment(signal, previousPosition, position) < 1.8
      ) {
        this.lastViolationCycle = cycle;
        return true;
      }
    }
    return false;
  }

  playerDrivingAdvice(position: Point, heading: number, speed: number, route: Point[] = [], trackHud = true, ignorePriorityId?: string, ignoreTraffic = false) {
    let targetSpeed = Number.POSITIVE_INFINITY;
    let reason: AutoBrakeReason = 'clear';
    if (this.signalsEnabled) {
      const stoppingDistance = speed * speed / (2 * GAME_CONFIG.vehicle.brakeMps2) + 10;
      for (const signal of this.signals) {
        const state = this.signalState(signal);
        if (state === 'green') continue;
        const gap = closestGap(
          distanceAhead(position, heading, signal, 5.5),
          route.length >= 2 ? distanceAlongRoute(position, route, signal, 5.5, stoppingDistance) : null
        );
        const canStopSafelyOnYellow = state === 'yellow' && gap !== null && gap > Math.max(4, speed * 0.45);
        if (gap !== null && gap < stoppingDistance && (state === 'red' || canStopSafelyOnYellow)) {
          targetSpeed = 0;
          reason = 'red-signal';
          break;
        }
      }
    }

    const shouldAvoidTraffic = !ignoreTraffic && !this.playerRecovery.active;
    if (shouldAvoidTraffic && this.enabled) for (const vehicle of this.vehicles) {
      if (this.elapsed < vehicle.ghostWithPlayerUntil || vehicle.recovery.active) continue;
      if (Math.abs(vehicle.position.x - position.x) > 55 || Math.abs(vehicle.position.y - position.y) > 55) continue;
      const gap = closestGap(
        distanceAhead(position, heading, vehicle.position, 3.6),
        route.length >= 2 ? distanceAlongRoute(position, route, vehicle.position, 3.6, 42) : null
      );
      if (gap !== null && gap < 42) {
        const safeTarget = Math.min(vehicle.speed, Math.max(0, (gap - 10) * 0.65));
        if (safeTarget < targetSpeed) {
          targetSpeed = safeTarget;
          reason = 'traffic';
        }
      }
      if (yieldingPathsConflict(
        { position, heading, speed },
        { position: vehicle.position, heading: vehicle.heading, speed: vehicle.speed },
        3,
        4
      )) {
        targetSpeed = 0;
        reason = 'traffic';
      }
    }
    if (shouldAvoidTraffic) for (const priority of this.priorityVehicles) {
      if (priority.reckless) continue;
      if (priority.id === ignorePriorityId) continue;
      const gap = closestGap(
        distanceAhead(position, heading, priority.position, 3.6),
        route.length >= 2 ? distanceAlongRoute(position, route, priority.position, 3.6, 42) : null
      );
      if (gap !== null && gap < 42) {
        const safeTarget = Math.min(priority.speed, Math.max(0, (gap - 10) * 0.65));
        if (safeTarget < targetSpeed) { targetSpeed = safeTarget; reason = 'traffic'; }
      }
      if (yieldingPathsConflict(
        { position, heading, speed },
        { position: priority.position, heading: priority.heading, speed: priority.speed },
        3,
        4
      )) { targetSpeed = 0; reason = 'traffic'; }
    }
    if (trackHud) this.playerBrakeReason = reason;
    return { targetSpeed, reason };
  }

  clearPlayerDrivingAdvice() {
    this.playerBrakeReason = 'clear';
  }

  cycleSignalOverride() {
    this.signalOverride = this.signalOverride === null
      ? 'green'
      : this.signalOverride === 'green'
        ? 'yellow'
        : this.signalOverride === 'yellow'
          ? 'red'
          : null;
    return this.signalOverride ?? 'automatic';
  }

  setDensity(density: TrafficDensity) {
    const multiplier = GAME_CONFIG.traffic.densityMultipliers[density];
    this.requestedVehicleLimit = Math.max(8, Math.round(this.vehicles.length * multiplier));
    this.activeVehicleLimit = Math.max(0, this.requestedVehicleLimit - this.reservedSlots);
  }

  setReservedSlots(count: number) {
    this.fleetReservedSlots = Math.max(0, Math.min(8, Math.floor(count)));
    this.rebuildExternalTraffic();
  }

  setOnlineReservedSlots(count: number) {
    this.onlineReservedSlots = Math.max(0, Math.min(GAME_CONFIG.traffic.npcVehicleCount + GAME_CONFIG.traffic.npcBusCount + GAME_CONFIG.traffic.npcUtilityCount, Math.floor(count)));
    this.rebuildExternalTraffic();
  }

  private rebuildExternalTraffic() {
    this.reservedSlots = this.fleetReservedSlots + this.onlineReservedSlots;
    this.activeVehicleLimit = Math.max(0, this.requestedVehicleLimit - this.reservedSlots);
    this.priorityVehicles = [...this.fleetPriorityVehicles, ...this.onlinePriorityVehicles].slice(0, 32);
  }

  setPriorityVehicles(vehicles: PriorityTrafficVehicle[]) {
    this.fleetPriorityVehicles = vehicles.slice(0, 8).map((vehicle) => ({ ...vehicle, position: { ...vehicle.position } }));
    this.rebuildExternalTraffic();
  }

  setOnlinePriorityVehicles(vehicles: PriorityTrafficVehicle[]) {
    this.onlinePriorityVehicles = vehicles.slice(0, 24).map((vehicle) => ({ ...vehicle, position: { ...vehicle.position } }));
    this.rebuildExternalTraffic();
  }

  handlePlayerCollision(previousPosition: Point, position: Point, playerSpeed = 0, playerHeading = 0, autopilotEnabled = false): PlayerCollisionResult {
    let contacts = 0;
    let nonSolidContacts = 0;
    let autopilotRecovery = false;
    let strongest: ReturnType<typeof impactMetrics> | null = null;
    let resolvedPosition: Point | null = null;
    for (const vehicle of this.vehicles) {
      if (vehicle.index >= this.activeVehicleLimit) continue;
      if (Math.abs(vehicle.position.x - position.x) > 18 || Math.abs(vehicle.position.y - position.y) > 18) continue;
      const sweptContact = sweptPointOverlapsVehicle(
        previousPosition,
        position,
        vehicle.position,
        vehicle.heading,
        vehicle.length,
        vehicle.width,
        GAME_CONFIG.vehicle.lengthMeters,
        GAME_CONFIG.vehicle.widthMeters
      );
      const contact = Boolean(sweptContact);
      if (contact) {
        const nonSolidRecovery = vehicle.recovery.active || (autopilotEnabled && this.playerRecovery.active);
        if (nonSolidRecovery) {
          nonSolidContacts += 1;
          if (!vehicle.recovery.active && vehicle.recovery.start()) this.activateVehicleRecovery(vehicle, true);
          vehicle.contactWithPlayer = false;
          vehicle.ghostWithPlayerUntil = Math.max(vehicle.ghostWithPlayerUntil, this.elapsed + 0.2);
          continue;
        }
        contacts += 1;
        const npcSpeedBeforeImpact = vehicle.speed;
        if (vehicle.ghostWithPlayerUntil > 0) {
          // Keep the pair non-solid until it actually separates. This avoids a
          // second impact if a signal delays the automatic recovery.
          vehicle.ghostWithPlayerUntil = Math.max(vehicle.ghostWithPlayerUntil, this.elapsed + 0.2);
          vehicle.contactWithPlayer = true;
          continue;
        }
        if (autopilotEnabled) {
          vehicle.speed = 0;
          vehicle.stunnedUntil = Math.max(vehicle.stunnedUntil, this.elapsed + GAME_CONFIG.traffic.collisionStunSeconds);
          vehicle.ghostWithPlayerUntil = this.elapsed + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
          vehicle.contactWithPlayer = true;
          autopilotRecovery = true;
          continue;
        }
        if (!vehicle.contactWithPlayer) {
          vehicle.speed = 0;
          vehicle.stunnedUntil = Math.max(vehicle.stunnedUntil, this.elapsed + GAME_CONFIG.traffic.collisionStunSeconds);
          vehicle.state = 'stunned';
          vehicle.stopReason = 'collision';
          const metrics = impactMetrics(
            { position, heading: playerHeading, speed: playerSpeed },
            { position: vehicle.position, heading: vehicle.heading, speed: npcSpeedBeforeImpact }
          );
          if (!strongest || metrics.relativeSpeedKmh > strongest.relativeSpeedKmh) strongest = metrics;
          const previousOverlaps = pointOverlapsVehicle(
            previousPosition, vehicle.position, vehicle.heading, vehicle.length, vehicle.width,
            GAME_CONFIG.vehicle.lengthMeters, GAME_CONFIG.vehicle.widthMeters
          );
          if (!previousOverlaps && sweptContact && sweptContact.progress > 0) {
            const safeProgress = Math.max(0, sweptContact.progress - GAME_CONFIG.traffic.collision.contactToleranceMeters);
            resolvedPosition = {
              x: previousPosition.x + (position.x - previousPosition.x) * safeProgress,
              y: previousPosition.y + (position.y - previousPosition.y) * safeProgress
            };
          }
        }
      } else if (vehicle.ghostWithPlayerUntil > 0 && this.elapsed >= vehicle.ghostWithPlayerUntil) vehicle.ghostWithPlayerUntil = 0;
      vehicle.contactWithPlayer = contact;
    }

    const startedContact = contacts > 0 && !this.collisionActive;
    this.collisionActive = contacts > 0 || nonSolidContacts > 0;
    if (startedContact && this.elapsed >= this.collisionCooldownUntil) {
      this.collisionCooldownUntil = this.elapsed + GAME_CONFIG.traffic.collisionCooldownSeconds;
      const metrics = strongest ?? { relativeSpeedKmh: 0, severity: 'contact' as const, direction: 'front' as const };
      return {
        impact: true,
        autopilotRecovery,
        severity: metrics.severity,
        relativeSpeedKmh: metrics.relativeSpeedKmh,
        conditionDamage: GAME_CONFIG.traffic.collision.conditionDamage[metrics.severity],
        retainedSpeed: GAME_CONFIG.traffic.collision.retainedSpeed[metrics.severity],
        resolvedPosition
      };
    }
    return { impact: false, autopilotRecovery, severity: null, relativeSpeedKmh: 0, conditionDamage: 0, retainedSpeed: 1, resolvedPosition: null };
  }

  debugPlaceVehicle(position: Point, heading: number, distance: number) {
    const vehicle = this.vehicles[0];
    if (!vehicle) return;
    vehicle.position = {
      x: position.x + Math.cos(heading) * distance,
      y: position.y + Math.sin(heading) * distance
    };
    vehicle.targetPosition = {
      x: vehicle.position.x + Math.cos(heading) * 50,
      y: vehicle.position.y + Math.sin(heading) * 50
    };
    vehicle.heading = heading;
    vehicle.speed = 0;
    vehicle.contactWithPlayer = false;
    vehicle.stunnedUntil = this.elapsed + 5;
    vehicle.ghostWithPlayerUntil = 0;
    vehicle.headOnDeadlockSeconds = 0;
    vehicle.recovery.reset();
    vehicle.visual?.setVisible(true);
  }

  debugPlaceTrafficJam(position: Point, heading: number) {
    // Keep the synthetic deadlock focused on traffic recovery. A red signal at
    // the player's current node can otherwise keep the player correctly
    // stopped after the four NPCs have escaped, making the diagnostic depend
    // on the signal phase chosen for this particular map spawn.
    this.signalOverride = 'green';
    for (const [offset, vehicle] of this.vehicles.slice(0, 4).entries()) {
      const distance = 10 + offset * 8;
      vehicle.position = {
        x: position.x + Math.cos(heading) * distance,
        y: position.y + Math.sin(heading) * distance
      };
      vehicle.targetPosition = {
        x: vehicle.position.x + Math.cos(heading) * 60,
        y: vehicle.position.y + Math.sin(heading) * 60
      };
      vehicle.heading = heading;
      vehicle.speed = 0;
      vehicle.contactWithPlayer = false;
      vehicle.stunnedUntil = this.elapsed + 30;
      vehicle.ghostWithPlayerUntil = 0;
      vehicle.headOnDeadlockSeconds = 0;
      vehicle.recovery.reset();
      vehicle.visual?.setVisible(true);
    }
  }

  debugPlaceHeadOnVehicle(position: Point, heading: number) {
    this.debugPlaceVehicle(position, heading + Math.PI, 9);
    const vehicle = this.vehicles[0];
    if (!vehicle) return;
    vehicle.position = {
      x: position.x + Math.cos(heading) * 9,
      y: position.y + Math.sin(heading) * 9
    };
    vehicle.heading = heading + Math.PI;
    vehicle.targetPosition = {
      x: vehicle.position.x + Math.cos(vehicle.heading) * 50,
      y: vehicle.position.y + Math.sin(vehicle.heading) * 50
    };
    // Hold the synthetic oncoming vehicle long enough to reproduce a genuine
    // face-to-face standstill instead of letting the two simply pass each other.
    vehicle.stunnedUntil = this.elapsed + 10;
  }

  debugPlaceCollision(position: Point, heading: number) {
    this.debugPlaceVehicle(position, heading + Math.PI, 0);
    const vehicle = this.vehicles[0];
    if (!vehicle) return;
    vehicle.heading = heading + Math.PI;
    vehicle.stunnedUntil = 0;
  }

  stats() {
    return {
      total: Math.min(this.vehicles.length, this.activeVehicleLimit),
      capacity: this.vehicles.length,
      hardCeiling: GAME_CONFIG.traffic.maximumTerrestrialEntities,
      reservedSlots: this.reservedSlots,
      buses: this.vehicles.filter((vehicle) => vehicle.index < this.activeVehicleLimit && vehicle.kind === 'bus').length,
      utility: this.vehicles.filter((vehicle) => vehicle.index < this.activeVehicleLimit && vehicle.kind === 'utility').length,
      stunned: this.vehicles.filter((vehicle) => vehicle.index < this.activeVehicleLimit && (vehicle.contactWithPlayer || this.elapsed < vehicle.stunnedUntil)).length,
      ghosted: this.vehicles.filter((vehicle) => vehicle.index < this.activeVehicleLimit && (this.elapsed < vehicle.ghostWithPlayerUntil || vehicle.recovery.active)).length,
      deadlockRecoveries: this.deadlockRecoveries,
      brakeReason: this.playerBrakeReason,
      stopReason: mostCommonStopReason(this.vehicles.filter((vehicle) => vehicle.index < this.activeVehicleLimit))
    };
  }

  private validEdges(node: GraphNode, majorOnly = false): GraphEdge[] {
    const valid = node.edges.filter((edge) => {
      const road = this.roads.get(edge.roadId);
      if (this.laneGraph) return this.nodes.has(edge.to) && (!majorOnly || MAJOR_ROADS.has(edge.highway ?? ''));
      return road && isDrivableRoad(road) && this.nodes.has(edge.to) && (!majorOnly || MAJOR_ROADS.has(road.highway));
    });
    return valid.length || !majorOnly ? valid : this.validEdges(node, false);
  }

  private advanceVehicle(vehicle: TrafficVehicle) {
    if (this.mergeOwnerByNode.get(vehicle.target.id) === vehicle.index) this.mergeOwnerByNode.delete(vehicle.target.id);
    vehicle.mergeWaitSeconds = 0;
    const previousId = vehicle.current.id;
    vehicle.current = vehicle.target;
    vehicle.recentNodeIds.push(vehicle.current.id);
    if (vehicle.recentNodeIds.length > 12) vehicle.recentNodeIds.shift();
    if (vehicle.recentNodeIds.length === 12 && new Set(vehicle.recentNodeIds).size <= 3) {
      vehicle.recentNodeIds = [];
      if (vehicle.recovery.start()) this.activateVehicleRecovery(vehicle, true);
    }
    const preferred = this.validEdges(vehicle.current, vehicle.kind === 'bus');
    const forward = preferred.filter((edge) => edge.to !== previousId);
    const unexplored = forward.filter((edge) => !vehicle.recentNodeIds.includes(edge.to));
    const exits = unexplored.filter((edge) => !edge.connector);
    const choices = exits.length ? exits : unexplored.length ? unexplored : forward.length ? forward : preferred;
    if (!choices.length) {
      vehicle.speed = 0;
      return;
    }
    const edge = choices[(vehicle.index + Math.floor(this.elapsed / 4)) % choices.length];
    const target = this.nodes.get(edge.to);
    if (!target) return;
    const road = this.roads.get(edge.roadId);
    vehicle.laneIndex = Math.min(vehicle.laneIndex, directionalLaneCount(road) - 1);
    vehicle.previousId = previousId;
    vehicle.edge = edge;
    vehicle.target = target;
    vehicle.targetPosition = this.laneGraph
      ? { x: target.x, y: target.y }
      : pointInTrafficLane(target, vehicle.current, target, road, vehicle.laneIndex);
  }

  private setSignals(signals: MapSignal[]) {
    this.signals = [...signals];
    this.signalByNode.clear();
    this.signalIndex.clear();
    signals.forEach((signal, index) => {
      const laneNodes = this.nodesBySource.get(signal.nodeId);
      if (this.laneGraph && laneNodes?.length) for (const node of laneNodes) this.signalByNode.set(node.id, signal);
      else this.signalByNode.set(signal.nodeId, signal);
      this.signalIndex.set(signal.id, index);
    });
  }

  private isNarrowingMerge(vehicle: TrafficVehicle) {
    const incoming = directionalLaneCount(this.roads.get(vehicle.edge.roadId));
    if (incoming <= 1) return false;
    const outgoing = this.validEdges(vehicle.target).map((edge) => directionalLaneCount(this.roads.get(edge.roadId)));
    return outgoing.length > 0 && Math.min(...outgoing) < incoming;
  }

  private hasNodeEntryPriority(vehicle: TrafficVehicle, remaining: number) {
    const candidates = this.vehicles
      .filter((other) => other.index < this.activeVehicleLimit && !other.recovery.active && other.target.id === vehicle.target.id)
      .map((other) => ({
        index: other.index,
        remaining: other === vehicle ? remaining : Math.hypot(other.targetPosition.x - other.position.x, other.targetPosition.y - other.position.y)
      }));
    const owner = selectMergeOwner(this.mergeOwnerByNode.get(vehicle.target.id), candidates);
    if (owner === null) return true;
    this.mergeOwnerByNode.set(vehicle.target.id, owner);
    return owner === vehicle.index;
  }

  private nearestLeadGap(vehicle: TrafficVehicle, heading: number) {
    let best = Number.POSITIVE_INFINITY;
    for (const other of this.nearbyVehicles(vehicle.position)) {
      if (other === vehicle || other.recovery.active || Math.cos(other.heading - heading) < 0.55) continue;
      if (Math.abs(other.position.x - vehicle.position.x) > 42 || Math.abs(other.position.y - vehicle.position.y) > 42) continue;
      const gap = distanceAhead(vehicle.position, heading, other.position, (vehicle.width + other.width) * 0.62);
      if (gap !== null) best = Math.min(best, gap - other.length * 0.5);
    }
    return best;
  }

  private hasIntersectionConflict(vehicle: TrafficVehicle, heading: number) {
    for (const other of this.nearbyVehicles(vehicle.position)) {
      if (other === vehicle || other.recovery.active || vehicle.index < other.index || Math.cos(other.heading - heading) > 0.72) continue;
      if (Math.abs(other.position.x - vehicle.position.x) > 28 || Math.abs(other.position.y - vehicle.position.y) > 28) continue;
      if (pathsConflict(
        { position: vehicle.position, heading, speed: vehicle.speed },
        { position: other.position, heading: other.heading, speed: other.speed },
        2.4,
        (vehicle.width + other.width) * 0.7 + 1
      )) return true;
    }
    return false;
  }

  private rebuildSpatialIndex() {
    this.spatialVehicles.clear();
    for (const vehicle of this.vehicles) {
      if (vehicle.index >= this.activeVehicleLimit) continue;
      const key = spatialKey(vehicle.position);
      const bucket = this.spatialVehicles.get(key);
      if (bucket) bucket.push(vehicle);
      else this.spatialVehicles.set(key, [vehicle]);
    }
  }

  private nearbyVehicles(position: Point) {
    const cellX = Math.floor(position.x / 40);
    const cellY = Math.floor(position.y / 40);
    const nearby: TrafficVehicle[] = [];
    for (let x = cellX - 1; x <= cellX + 1; x += 1) for (let y = cellY - 1; y <= cellY + 1; y += 1) {
      const bucket = this.spatialVehicles.get(`${x}:${y}`);
      if (bucket) nearby.push(...bucket);
    }
    return nearby;
  }

  private drawCrowdVehicle(vehicle: TrafficVehicle, projected: Point) {
    const heading = projectedHeading(this.project, vehicle.position, vehicle.heading);
    const halfLength = vehicle.kind === 'bus' ? 3.7 : vehicle.kind === 'utility' ? 2.5 : 2;
    const halfWidth = vehicle.kind === 'bus' ? 0.95 : 0.72;
    const forward = { x: Math.cos(heading) * halfLength, y: Math.sin(heading) * halfLength };
    const side = { x: -Math.sin(heading) * halfWidth, y: Math.cos(heading) * halfWidth };
    const a = { x: projected.x + forward.x + side.x, y: projected.y + forward.y + side.y };
    const b = { x: projected.x + forward.x - side.x, y: projected.y + forward.y - side.y };
    const c = { x: projected.x - forward.x - side.x, y: projected.y - forward.y - side.y };
    const d = { x: projected.x - forward.x + side.x, y: projected.y - forward.y + side.y };
    this.crowdGraphics.fillStyle(0x07111a, 0.18).fillCircle(projected.x + 0.7, projected.y + 0.7, halfLength * 0.72);
    this.crowdGraphics.fillStyle(vehicle.color, 0.94)
      .fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y)
      .fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
  }
}

function mostCommonStopReason(vehicles: TrafficVehicle[]) {
  const stopped = vehicles.filter((vehicle) => vehicle.stopReason !== 'clear');
  if (!stopped.length) return 'Livre';
  const labels = { signal: 'Semáforo', traffic: 'Tráfego', player: 'Jogador', collision: 'Colisão', clear: 'Livre' };
  const counts = new Map<TrafficVehicle['stopReason'], number>();
  for (const vehicle of stopped) counts.set(vehicle.stopReason, (counts.get(vehicle.stopReason) ?? 0) + 1);
  const reason = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return labels[reason];
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(point.x - start.x, point.y - start.y);
  const progress = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (start.x + dx * progress), point.y - (start.y + dy * progress));
}

function vehicleSpec(kind: VehicleKind, index: number) {
  if (kind === 'bus') return { length: 11.5, width: 2.55, maxSpeed: 6.8 + index % 2 * 0.35, acceleration: 1.25, braking: 3.2 };
  if (kind === 'utility') return { length: 6.1, width: 2.15, maxSpeed: 7.5 + index % 3 * 0.3, acceleration: 1.8, braking: 3.8 };
  return { length: 4.4, width: 1.9, maxSpeed: GAME_CONFIG.traffic.npcSpeedMps * (0.82 + index % 4 * 0.06), acceleration: 2.4, braking: 4.8 };
}

function rotateTowards(current: number, target: number, maxStep: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(delta, -maxStep, maxStep);
}

function projectedHeading(project: Project, position: Point, heading: number) {
  const from = project(position);
  const to = project({ x: position.x + Math.cos(heading), y: position.y + Math.sin(heading) });
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function closestGap(a: number | null, b: number | null) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function spatialKey(position: Point) {
  return `${Math.floor(position.x / 40)}:${Math.floor(position.y / 40)}`;
}
