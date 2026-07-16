import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import type { GraphNode, MapSignal, NavigationGraph, Point } from '../../types/game';
import { createCarVisual } from '../entities/VehicleVisual';

type Project = (point: Point) => Point;
type SignalState = 'green' | 'yellow' | 'red';

type TrafficVehicle = {
  visual: Phaser.GameObjects.Container;
  position: Point;
  current: GraphNode;
  target: GraphNode;
  previousId: string;
  speed: number;
  index: number;
};

export class TrafficSystem {
  enabled = true;
  signalsEnabled = true;
  timeScale = 1;
  private elapsed = 0;
  private readonly nodes = new Map<string, GraphNode>();
  private readonly signalByNode = new Map<string, MapSignal>();
  private readonly vehicles: TrafficVehicle[] = [];
  private lastViolationCycle = -1;

  constructor(
    scene: Phaser.Scene,
    graph: NavigationGraph,
    private readonly signals: MapSignal[],
    private readonly project: Project,
    spawn: Point
  ) {
    for (const node of graph.nodes) this.nodes.set(node.id, node);
    for (const signal of signals) this.signalByNode.set(signal.nodeId, signal);
    const candidates = graph.nodes.filter((node) => node.edges.length > 0 && Math.hypot(node.x - spawn.x, node.y - spawn.y) < 900);
    const colors = [0x5b8def, 0xe85d75, 0xf3b33d, 0x8e6bbf, 0x42a66c, 0xe6e9ee, 0x3d526d, 0xd9843b, 0x2f8d91, 0xb14d4d];
    for (let index = 0; index < GAME_CONFIG.traffic.npcVehicleCount; index += 1) {
      const current = candidates[(index * 197 + 41) % candidates.length];
      const edge = current.edges[index % current.edges.length];
      const target = this.nodes.get(edge.to) ?? current;
      const visual = createCarVisual(scene, colors[index % colors.length]);
      visual.setScale(0.68).setDepth(24);
      this.vehicles.push({ visual, position: { x: current.x, y: current.y }, current, target, previousId: current.id, speed: 0, index });
    }
  }

  update(deltaSeconds: number, playerPosition: Point) {
    if (!this.enabled) {
      for (const vehicle of this.vehicles) vehicle.visual.setVisible(false);
      return;
    }
    this.elapsed += deltaSeconds * this.timeScale;
    for (const vehicle of this.vehicles) {
      const distanceFromPlayer = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.y - playerPosition.y);
      vehicle.visual.setVisible(distanceFromPlayer < 650);
      if (distanceFromPlayer > 900 && (Math.floor(this.elapsed * 10) + vehicle.index) % 4 !== 0) continue;
      const dx = vehicle.target.x - vehicle.position.x;
      const dy = vehicle.target.y - vehicle.position.y;
      const remaining = Math.hypot(dx, dy);
      let desiredSpeed = GAME_CONFIG.traffic.npcSpeedMps * (0.82 + (vehicle.index % 4) * 0.06);
      const signal = this.signalByNode.get(vehicle.target.id);
      if (signal && this.signalState(signal) !== 'green' && remaining < 16) desiredSpeed = 0;
      for (const other of this.vehicles) {
        if (other === vehicle) continue;
        const gap = Math.hypot(other.position.x - vehicle.position.x, other.position.y - vehicle.position.y);
        if (gap < GAME_CONFIG.traffic.safetyDistanceMeters && Math.hypot(other.position.x - vehicle.target.x, other.position.y - vehicle.target.y) < remaining) {
          desiredSpeed = Math.min(desiredSpeed, other.speed * 0.8);
        }
      }
      vehicle.speed += Math.sign(desiredSpeed - vehicle.speed) * Math.min(Math.abs(desiredSpeed - vehicle.speed), 3.4 * deltaSeconds);
      if (remaining <= Math.max(1, vehicle.speed * deltaSeconds)) {
        vehicle.position = { x: vehicle.target.x, y: vehicle.target.y };
        const oldId = vehicle.current.id;
        vehicle.current = vehicle.target;
        const choices = vehicle.current.edges.filter((edge) => edge.to !== oldId);
        const edge = (choices.length ? choices : vehicle.current.edges)[(vehicle.index + Math.floor(this.elapsed / 5)) % Math.max(1, (choices.length ? choices : vehicle.current.edges).length)];
        if (edge) vehicle.target = this.nodes.get(edge.to) ?? vehicle.current;
        vehicle.previousId = oldId;
      } else if (remaining > 0) {
        vehicle.position.x += (dx / remaining) * vehicle.speed * deltaSeconds;
        vehicle.position.y += (dy / remaining) * vehicle.speed * deltaSeconds;
      }
      const projected = this.project(vehicle.position);
      const projectedTarget = this.project(vehicle.target);
      vehicle.visual.setPosition(projected.x, projected.y);
      vehicle.visual.setRotation(Math.atan2(projectedTarget.y - projected.y, projectedTarget.x - projected.x));
    }
  }

  signalState(signal: MapSignal): SignalState {
    if (!this.signalsEnabled) return 'green';
    const { greenSeconds, yellowSeconds, allRedSeconds } = GAME_CONFIG.traffic.signal;
    const phaseLength = greenSeconds + yellowSeconds + allRedSeconds;
    const index = this.signals.indexOf(signal);
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

  collisionWithPlayer(position: Point) {
    return this.vehicles.some((vehicle) => Math.hypot(vehicle.position.x - position.x, vehicle.position.y - position.y) < 4.6);
  }
}
