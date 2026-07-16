import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { GraphRouter } from '../../map/routing/GraphRouter';
import type { FleetEmployee, FleetVehicle, PlayerSave, Point, TaxiPoint } from '../../types/game';
import { createCarVisual } from '../entities/VehicleVisual';
import { automaticThrottle, missionApproachTargetSpeed } from '../systems/Autopilot';
import { RoadSurfaceIndex } from '../systems/RoadSurfaceIndex';
import { guidanceForRoute } from '../systems/RouteSteeringAssist';
import { VehicleController } from '../systems/VehicleController';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { fleetSimulationLevel } from './FleetService';

type Project = (point: Point) => Point;

/**
 * Physical representation of the local employee. The financial simulation
 * remains event based, while this layer gives a nearby shift a real vehicle,
 * real lane route, steering, signals and traffic avoidance.
 */
export class FleetVehicleSystem {
  private controller?: VehicleController;
  private visual?: Phaser.GameObjects.Container;
  private activeVehicleId: string | null = null;
  private route: Point[] = [];
  private waypointIndex = 0;
  private stuckSeconds = 0;
  private followEnabled = false;
  private playerContact = false;
  private readonly parkedVisuals = new Map<string, Phaser.GameObjects.Container>();
  private readonly waypoints: Point[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly router: GraphRouter,
    private readonly surface: RoadSurfaceIndex,
    private readonly traffic: TrafficSystem,
    private readonly project: Project,
    taxiPoints: TaxiPoint[],
    garage: Point
  ) {
    const candidates = router.candidates(100).filter((_, index) => index % 17 === 0).slice(0, 10);
    this.waypoints = [garage, ...taxiPoints.map((point) => point.entrance), ...candidates].map(({ x, y }) => ({ x, y }));
  }

  update(save: PlayerSave, playerPosition: Point, deltaSeconds: number) {
    const shift = save.fleet.activeShift;
    const employee = shift ? save.fleet.employees.find((item) => item.id === shift.employeeId) : undefined;
    const vehicle = shift ? save.fleet.vehicles.find((item) => item.id === shift.vehicleId) : undefined;
    this.syncParkedVehicles(save, shift?.vehicleId ?? null);

    if (!shift || !employee || !vehicle) {
      this.releaseActiveVehicle();
      return;
    }

    const distance = Math.hypot(vehicle.position.x - playerPosition.x, vehicle.position.y - playerPosition.y);
    const level = this.followEnabled ? 'detailed' : fleetSimulationLevel(distance);
    shift.simulationLevel = level;
    vehicle.simulationLevel = level;
    if (level === 'detailed') this.updateDetailed(vehicle, employee, deltaSeconds);
    else {
      this.hideDetailedVehicle();
      this.traffic.setReservedSlots(0);
      this.traffic.setPriorityVehicles([]);
      if (level === 'simplified') this.updateSimplified(vehicle, employee, deltaSeconds);
    }
  }

  isVisible() {
    return Boolean(this.visual?.visible);
  }

  followedObject() {
    return this.visual?.visible ? this.visual : null;
  }

  setFollowEnabled(enabled: boolean) {
    this.followEnabled = enabled;
  }

  activePosition() {
    return this.controller ? { ...this.controller.position } : null;
  }

  handlePlayerCollision(playerPosition: Point, playerSpeed: number) {
    if (!this.controller || !this.visual?.visible) {
      this.playerContact = false;
      return { impact: false, relativeSpeedKmh: 0 };
    }
    const contact = Math.hypot(playerPosition.x - this.controller.position.x, playerPosition.y - this.controller.position.y) < 4.4;
    const started = contact && !this.playerContact;
    this.playerContact = contact;
    if (!started) return { impact: false, relativeSpeedKmh: 0 };
    const relativeSpeedKmh = Math.abs(playerSpeed - this.controller.speed) * 3.6;
    this.controller.speed = 0;
    return { impact: true, relativeSpeedKmh };
  }

  destroy() {
    this.releaseActiveVehicle();
    for (const visual of this.parkedVisuals.values()) visual.destroy();
    this.parkedVisuals.clear();
  }

  private updateDetailed(vehicle: FleetVehicle, employee: FleetEmployee, deltaSeconds: number) {
    this.ensureDetailedVehicle(vehicle);
    if (!this.controller || !this.visual) return;
    this.visual.setVisible(true);
    this.traffic.setReservedSlots(1);
    this.ensureRoute(vehicle.position);
    const route = this.route;
    if (route.length < 2) return;

    const target = route[route.length - 1];
    const guidance = guidanceForRoute(
      this.controller.position,
      this.controller.rotation,
      this.controller.speed,
      route,
      GAME_CONFIG.vehicle.autopilotCruiseSpeedMps * 0.88,
      GAME_CONFIG.vehicle.brakeMps2
    );
    const trafficAdvice = this.traffic.playerDrivingAdvice(
      this.controller.position,
      this.controller.rotation,
      Math.abs(this.controller.speed),
      route,
      false,
      vehicle.id
    );
    const distance = Math.hypot(this.controller.position.x - target.x, this.controller.position.y - target.y);
    const approach = missionApproachTargetSpeed(
      distance,
      9,
      GAME_CONFIG.vehicle.brakeMps2,
      GAME_CONFIG.vehicle.autopilotCruiseSpeedMps * 0.88
    );
    const targetSpeed = Math.max(0, Math.min(guidance.targetSpeedMps, trafficAdvice.targetSpeed, approach));
    const travelled = this.controller.update({
      throttle: automaticThrottle(Math.abs(this.controller.speed), targetSpeed),
      steering: distance > 9 ? guidance.steering : 0,
      handbrake: false,
      assistanceEnabled: true,
      assistanceHeading: guidance.preferredRoadHeading
    }, Math.min(0.05, deltaSeconds), Math.max(0.1, vehicle.fuel));
    this.controller.fuelUsed = 0;
    this.route = advanceRoute(this.route, this.controller.position);
    this.stuckSeconds = targetSpeed > 1.5 && travelled < 0.01 && Math.abs(this.controller.speed) < 0.8
      ? this.stuckSeconds + deltaSeconds
      : 0;
    if (this.stuckSeconds > 2.5) {
      this.controller.recoverAutopilotToLane(guidance.preferredRoadHeading);
      this.stuckSeconds = 0;
    }
    if (distance <= 9 && Math.abs(this.controller.speed) < 1.2) this.advanceWaypoint(employee, vehicle);

    vehicle.position = { ...this.controller.position };
    vehicle.rotation = this.controller.rotation;
    vehicle.updatedAt = new Date().toISOString();
    this.placeVisual(this.visual, vehicle.position, vehicle.rotation);
    this.traffic.setPriorityVehicles([{
      id: vehicle.id,
      position: vehicle.position,
      heading: vehicle.rotation,
      speed: Math.abs(this.controller.speed)
    }]);
  }

  private updateSimplified(vehicle: FleetVehicle, employee: FleetEmployee, deltaSeconds: number) {
    this.ensureRoute(vehicle.position);
    let budget = Math.min(2, Math.max(0, deltaSeconds)) * 7.2;
    while (budget > 0 && this.route.length >= 2) {
      const target = this.route[1];
      const distance = Math.hypot(target.x - vehicle.position.x, target.y - vehicle.position.y);
      if (distance <= budget || distance < 0.1) {
        vehicle.position = { ...target };
        this.route.shift();
        budget -= distance;
      } else {
        vehicle.rotation = Math.atan2(target.y - vehicle.position.y, target.x - vehicle.position.x);
        vehicle.position.x += Math.cos(vehicle.rotation) * budget;
        vehicle.position.y += Math.sin(vehicle.rotation) * budget;
        budget = 0;
      }
    }
    if (this.route.length < 2) this.advanceWaypoint(employee, vehicle);
    vehicle.updatedAt = new Date().toISOString();
  }

  private ensureDetailedVehicle(vehicle: FleetVehicle) {
    if (this.activeVehicleId === vehicle.id && this.controller && this.visual) return;
    this.releaseActiveVehicle();
    this.activeVehicleId = vehicle.id;
    this.controller = new VehicleController(vehicle.position, vehicle.rotation, this.surface);
    this.controller.alignToRoad(false, vehicle.rotation);
    this.visual = this.createFleetVisual(vehicle).setDepth(29);
    this.route = [];
  }

  private ensureRoute(position: Point) {
    if (this.route.length >= 2 || !this.waypoints.length) return;
    for (let attempt = 0; attempt < this.waypoints.length; attempt += 1) {
      const target = this.waypoints[this.waypointIndex % this.waypoints.length];
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      this.route = this.router.drivingRoute(position, target);
      if (this.route.length >= 2) break;
    }
  }

  private advanceWaypoint(employee: FleetEmployee, vehicle: FleetVehicle) {
    this.route = [];
    const pickingUp = employee.state === 'seeking-trip' || employee.state === 'en-route';
    employee.state = pickingUp ? 'with-passenger' : 'seeking-trip';
    vehicle.state = pickingUp ? 'on-trip' : 'employee-driving';
  }

  private syncParkedVehicles(save: PlayerSave, activeShiftVehicleId: string | null) {
    const visibleIds = new Set<string>();
    for (const vehicle of save.fleet.vehicles) {
      if (vehicle.id === save.activeVehicleId || vehicle.id === activeShiftVehicleId) continue;
      if (!['parked', 'available'].includes(vehicle.state)) continue;
      visibleIds.add(vehicle.id);
      let visual = this.parkedVisuals.get(vehicle.id);
      if (!visual) {
        visual = this.createFleetVisual(vehicle).setDepth(20);
        this.parkedVisuals.set(vehicle.id, visual);
      }
      visual.setVisible(true);
      this.placeVisual(visual, vehicle.position, vehicle.rotation);
    }
    for (const [id, visual] of this.parkedVisuals) visual.setVisible(visibleIds.has(id));
  }

  private createFleetVisual(vehicle: FleetVehicle) {
    const color = vehicle.model === 'Sedan 2012' ? 0x4aa7a1 : 0xc97732;
    const container = createCarVisual(this.scene, color, vehicle.model === 'Hatch 1998', vehicle.taxiVisualEnabled).setScale(0.72);
    const badge = this.scene.add.graphics();
    badge.fillStyle(0x55e0b7, 0.95).fillCircle(-2.25, 0, 0.38);
    container.add(badge);
    return container;
  }

  private placeVisual(visual: Phaser.GameObjects.Container, position: Point, rotation: number) {
    const projected = this.project(position);
    const origin = this.project({ x: 0, y: 0 });
    const direction = this.project({ x: Math.cos(rotation), y: Math.sin(rotation) });
    visual.setPosition(projected.x, projected.y).setRotation(Math.atan2(direction.y - origin.y, direction.x - origin.x));
  }

  private hideDetailedVehicle() {
    if (this.controller && this.activeVehicleId) {
      this.visual?.setVisible(false);
      this.controller = undefined;
      this.activeVehicleId = null;
    }
  }

  private releaseActiveVehicle() {
    this.traffic.setReservedSlots(0);
    this.traffic.setPriorityVehicles([]);
    this.controller = undefined;
    this.visual?.destroy();
    this.visual = undefined;
    this.activeVehicleId = null;
    this.route = [];
  }
}

function advanceRoute(route: Point[], position: Point) {
  if (route.length < 2) return route;
  let closest = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < Math.min(route.length, 16); index += 1) {
    const distance = Math.hypot(position.x - route[index].x, position.y - route[index].y);
    if (distance < closestDistance) { closest = index; closestDistance = distance; }
  }
  return closestDistance < 20 ? [{ ...position }, ...route.slice(closest + 1)] : route;
}
