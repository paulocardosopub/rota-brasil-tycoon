import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { isDrivableRoad, pointInTrafficLane } from '../../map/routing/roadRules';
import type { GraphEdge, GraphNode, MapSignal, NavigationGraph, Point, RoadData } from '../../types/game';
import { createBusVisual, createCarVisual, createUtilityVehicleVisual } from '../entities/VehicleVisual';
import { distanceAhead, pathsConflict, pointOverlapsVehicle, yieldingPathsConflict } from './TrafficPhysics';

type Project = (point: Point) => Point;
type SignalState = 'green' | 'yellow' | 'red';
type VehicleKind = 'car' | 'taxi' | 'bus' | 'utility';

type TrafficVehicle = {
  visual: Phaser.GameObjects.Container;
  position: Point;
  targetPosition: Point;
  current: GraphNode;
  target: GraphNode;
  edge: GraphEdge;
  previousId: string;
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
};

export type AutoBrakeReason = 'clear' | 'traffic' | 'red-signal';

const MAJOR_ROADS = new Set(['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary']);

export class TrafficSystem {
  enabled = true;
  signalsEnabled = true;
  timeScale = 1;
  private elapsed = 0;
  private readonly nodes = new Map<string, GraphNode>();
  private readonly roads = new Map<string, RoadData>();
  private readonly signalByNode = new Map<string, MapSignal>();
  private readonly signalIndex = new Map<string, number>();
  private readonly vehicles: TrafficVehicle[] = [];
  private lastViolationCycle = -1;
  private collisionActive = false;
  private collisionCooldownUntil = 0;
  private playerBrakeReason: AutoBrakeReason = 'clear';

  constructor(
    scene: Phaser.Scene,
    graph: NavigationGraph,
    roads: RoadData[],
    private readonly signals: MapSignal[],
    private readonly project: Project,
    spawn: Point
  ) {
    for (const node of graph.nodes) this.nodes.set(node.id, node);
    for (const road of roads) this.roads.set(road.id, road);
    signals.forEach((signal, index) => {
      this.signalByNode.set(signal.nodeId, signal);
      this.signalIndex.set(signal.id, index);
    });

    const candidates = graph.nodes.filter((node) => {
      const distance = Math.hypot(node.x - spawn.x, node.y - spawn.y);
      return distance > 55 && distance < 900 && this.validEdges(node).length > 0;
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
      const position = pointInTrafficLane(current, current, target, road, laneIndex);
      const targetPosition = pointInTrafficLane(target, current, target, road, laneIndex);
      const spec = vehicleSpec(kind, index);
      const visual = kind === 'bus'
        ? createBusVisual(scene, index % 2 ? 0x2b7a78 : 0xc44d36).setScale(0.64)
        : kind === 'utility'
          ? createUtilityVehicleVisual(scene, index % 2 ? 0xe8ecef : 0x7c8f9e).setScale(0.68)
          : createCarVisual(scene, kind === 'taxi' ? 0xf2c744 : colors[index % colors.length]).setScale(0.68);
      visual.setDepth(24);
      this.vehicles.push({
        visual,
        position,
        targetPosition,
        current,
        target,
        edge,
        previousId: current.id,
        speed: 0,
        heading: Math.atan2(targetPosition.y - position.y, targetPosition.x - position.x),
        index,
        laneIndex,
        kind,
        contactWithPlayer: false,
        stunnedUntil: 0,
        ...spec
      });
    }
  }

  update(deltaSeconds: number, playerPosition: Point, playerSpeed = 0, playerHeading = 0) {
    if (!this.enabled) {
      for (const vehicle of this.vehicles) vehicle.visual.setVisible(false);
      return;
    }
    this.elapsed += deltaSeconds * this.timeScale;
    for (const vehicle of this.vehicles) {
      const distanceFromPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.y - playerPosition.y);
      vehicle.visual.setVisible(distanceFromPlayer < 650);
      if (distanceFromPlayer > 900 && (Math.floor(this.elapsed * 10) + vehicle.index) % 4 !== 0) continue;

      const dx = vehicle.targetPosition.x - vehicle.position.x;
      const dy = vehicle.targetPosition.y - vehicle.position.y;
      const remaining = Math.hypot(dx, dy);
      const travelHeading = remaining > 0.01 ? Math.atan2(dy, dx) : vehicle.heading;
      let desiredSpeed = vehicle.maxSpeed;
      let stopBeforeTarget = false;
      const signal = this.signalByNode.get(vehicle.target.id);
      if (signal && this.signalState(signal) !== 'green') {
        const brakingDistance = vehicle.speed * vehicle.speed / (2 * vehicle.braking) + 6;
        if (remaining < brakingDistance + 8) {
          desiredSpeed = 0;
          stopBeforeTarget = true;
        }
      }

      const leadGap = this.nearestLeadGap(vehicle, travelHeading);
      if (leadGap < 32) {
        const safeGap = GAME_CONFIG.traffic.safetyDistanceMeters + vehicle.length * 0.45;
        desiredSpeed = Math.min(desiredSpeed, Math.max(0, (leadGap - safeGap) * 0.72));
      }
      const playerGap = distanceAhead(vehicle.position, travelHeading, playerPosition, 3.4);
      if (playerGap !== null && playerGap < 38) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (playerGap - 10) * 0.55));
      if (yieldingPathsConflict(
        { position: vehicle.position, heading: travelHeading, speed: vehicle.speed },
        { position: playerPosition, heading: playerHeading, speed: playerSpeed },
        3,
        3.8
      )) desiredSpeed = 0;
      if (this.hasIntersectionConflict(vehicle, travelHeading)) desiredSpeed = 0;
      if (vehicle.contactWithPlayer || this.elapsed < vehicle.stunnedUntil) desiredSpeed = 0;

      const rate = desiredSpeed < vehicle.speed ? vehicle.braking : vehicle.acceleration;
      vehicle.speed += clamp(desiredSpeed - vehicle.speed, -rate * deltaSeconds, rate * deltaSeconds);
      if (stopBeforeTarget && remaining <= 6.2) vehicle.speed = 0;

      const step = vehicle.speed * deltaSeconds;
      if (!stopBeforeTarget && remaining <= Math.max(0.8, step)) {
        vehicle.position = { ...vehicle.targetPosition };
        this.advanceVehicle(vehicle);
      } else if (remaining > 0 && step > 0) {
        const allowedStep = stopBeforeTarget ? Math.min(step, Math.max(0, remaining - 6)) : Math.min(step, remaining);
        vehicle.position.x += dx / remaining * allowedStep;
        vehicle.position.y += dy / remaining * allowedStep;
      }

      const nextHeading = Math.atan2(vehicle.targetPosition.y - vehicle.position.y, vehicle.targetPosition.x - vehicle.position.x);
      vehicle.heading = rotateTowards(vehicle.heading, nextHeading, 2.8 * deltaSeconds);
      const projected = this.project(vehicle.position);
      vehicle.visual.setPosition(projected.x, projected.y).setRotation(projectedHeading(this.project, vehicle.position, vehicle.heading));
    }
  }

  signalState(signal: MapSignal): SignalState {
    if (!this.signalsEnabled) return 'green';
    const { greenSeconds, yellowSeconds, allRedSeconds } = GAME_CONFIG.traffic.signal;
    const phaseLength = greenSeconds + yellowSeconds + allRedSeconds;
    const index = this.signalIndex.get(signal.id) ?? 0;
    const groupOffset = index % 2 ? phaseLength : 0;
    const phase = (this.elapsed + groupOffset) % (phaseLength * 2);
    if (phase < greenSeconds) return 'green';
    if (phase < greenSeconds + yellowSeconds) return 'yellow';
    return 'red';
  }

  checkPlayerRedLight(position: Point, speedMps: number) {
    if (speedMps < 2 || !this.signalsEnabled) return false;
    const cycle = Math.floor(this.elapsed / 3);
    if (cycle === this.lastViolationCycle) return false;
    for (const signal of this.signals) {
      if (this.signalState(signal) === 'red' && Math.hypot(position.x - signal.x, position.y - signal.y) < 5) {
        this.lastViolationCycle = cycle;
        return true;
      }
    }
    return false;
  }

  playerDrivingAdvice(position: Point, heading: number, speed: number) {
    let targetSpeed = Number.POSITIVE_INFINITY;
    let reason: AutoBrakeReason = 'clear';
    if (this.signalsEnabled) {
      const stoppingDistance = speed * speed / (2 * GAME_CONFIG.vehicle.brakeMps2) + 10;
      for (const signal of this.signals) {
        if (this.signalState(signal) !== 'red') continue;
        const gap = distanceAhead(position, heading, signal, 5.5);
        if (gap !== null && gap < stoppingDistance) {
          targetSpeed = 0;
          reason = 'red-signal';
          break;
        }
      }
    }

    if (this.enabled) for (const vehicle of this.vehicles) {
      const gap = distanceAhead(position, heading, vehicle.position, 3.6);
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
    this.playerBrakeReason = reason;
    return { targetSpeed, reason };
  }

  clearPlayerDrivingAdvice() {
    this.playerBrakeReason = 'clear';
  }

  handlePlayerCollision(position: Point) {
    let contacts = 0;
    for (const vehicle of this.vehicles) {
      const contact = pointOverlapsVehicle(
        position,
        vehicle.position,
        vehicle.heading,
        vehicle.length,
        vehicle.width,
        GAME_CONFIG.vehicle.lengthMeters,
        GAME_CONFIG.vehicle.widthMeters
      );
      if (contact) {
        contacts += 1;
        if (!vehicle.contactWithPlayer) {
          vehicle.speed = 0;
          vehicle.stunnedUntil = Math.max(vehicle.stunnedUntil, this.elapsed + GAME_CONFIG.traffic.collisionStunSeconds);
        }
      }
      vehicle.contactWithPlayer = contact;
    }

    const startedContact = contacts > 0 && !this.collisionActive;
    this.collisionActive = contacts > 0;
    if (startedContact && this.elapsed >= this.collisionCooldownUntil) {
      this.collisionCooldownUntil = this.elapsed + GAME_CONFIG.traffic.collisionCooldownSeconds;
      return true;
    }
    return false;
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
    vehicle.visual.setVisible(true);
  }

  stats() {
    return {
      total: this.vehicles.length,
      buses: this.vehicles.filter((vehicle) => vehicle.kind === 'bus').length,
      utility: this.vehicles.filter((vehicle) => vehicle.kind === 'utility').length,
      stunned: this.vehicles.filter((vehicle) => vehicle.contactWithPlayer || this.elapsed < vehicle.stunnedUntil).length,
      brakeReason: this.playerBrakeReason
    };
  }

  private validEdges(node: GraphNode, majorOnly = false): GraphEdge[] {
    const valid = node.edges.filter((edge) => {
      const road = this.roads.get(edge.roadId);
      return road && isDrivableRoad(road) && this.nodes.has(edge.to) && (!majorOnly || MAJOR_ROADS.has(road.highway));
    });
    return valid.length || !majorOnly ? valid : this.validEdges(node, false);
  }

  private advanceVehicle(vehicle: TrafficVehicle) {
    const previousId = vehicle.current.id;
    vehicle.current = vehicle.target;
    const preferred = this.validEdges(vehicle.current, vehicle.kind === 'bus');
    const forward = preferred.filter((edge) => edge.to !== previousId);
    const choices = forward.length ? forward : preferred;
    if (!choices.length) {
      vehicle.speed = 0;
      return;
    }
    const edge = choices[(vehicle.index + Math.floor(this.elapsed / 4)) % choices.length];
    const target = this.nodes.get(edge.to);
    if (!target) return;
    const road = this.roads.get(edge.roadId);
    vehicle.previousId = previousId;
    vehicle.edge = edge;
    vehicle.target = target;
    vehicle.targetPosition = pointInTrafficLane(target, vehicle.current, target, road, vehicle.laneIndex);
  }

  private nearestLeadGap(vehicle: TrafficVehicle, heading: number) {
    let best = Number.POSITIVE_INFINITY;
    for (const other of this.vehicles) {
      if (other === vehicle || Math.cos(other.heading - heading) < 0.55) continue;
      const gap = distanceAhead(vehicle.position, heading, other.position, (vehicle.width + other.width) * 0.62);
      if (gap !== null) best = Math.min(best, gap - other.length * 0.5);
    }
    return best;
  }

  private hasIntersectionConflict(vehicle: TrafficVehicle, heading: number) {
    for (const other of this.vehicles) {
      if (other === vehicle || vehicle.index < other.index || Math.cos(other.heading - heading) > 0.72) continue;
      if (pathsConflict(
        { position: vehicle.position, heading, speed: vehicle.speed },
        { position: other.position, heading: other.heading, speed: other.speed },
        2.4,
        (vehicle.width + other.width) * 0.7 + 1
      )) return true;
    }
    return false;
  }
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
