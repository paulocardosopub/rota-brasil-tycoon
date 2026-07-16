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
import { buildFleetWaypoints, employeeIdentification, FleetRoutePlan } from './FleetRoutePlan';

type Project = (point: Point) => Point;

/**
 * Physical representation of the local employee. The financial simulation
 * remains event based, while this layer gives a nearby shift a real vehicle,
 * real lane route, steering, signals and traffic avoidance.
 */
export class FleetVehicleSystem {
  private controller?: VehicleController;
  private visual?: Phaser.GameObjects.Container;
  private driverLabel?: Phaser.GameObjects.Text;
  private activeVehicleId: string | null = null;
  private activeShiftId: string | null = null;
  private route: Point[] = [];
  private readonly routePlan = new FleetRoutePlan();
  private destinationRemaining = 0;
  private completedStops = 0;
  private identification: string | null = null;
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
    this.waypoints = buildFleetWaypoints(
      router.candidates(100),
      taxiPoints.map((point) => point.entrance),
      garage
    );
  }

  update(save: PlayerSave, playerPosition: Point, deltaSeconds: number) {
    const shift = save.fleet.activeShift;
    const employee = shift ? save.fleet.employees.find((item) => item.id === shift.employeeId) : undefined;
    const vehicle = shift ? save.fleet.vehicles.find((item) => item.id === shift.vehicleId) : undefined;
    this.syncParkedVehicles(save, shift?.vehicleId ?? null);

    if (!shift || !employee || !vehicle) {
      if (this.activeShiftId) this.routePlan.reset();
      this.activeShiftId = null;
      this.identification = null;
      this.destinationRemaining = 0;
      this.releaseActiveVehicle();
      return;
    }

    if (this.activeShiftId !== shift.id) {
      this.activeShiftId = shift.id;
      this.routePlan.reset();
      this.route = [];
      this.completedStops = 0;
    }
    this.identification = employeeIdentification(employee.name);

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

  routeTelemetry() {
    const target = this.routePlan.current(this.waypoints);
    return {
      target: target ? { ...target } : null,
      remaining: this.destinationRemaining,
      completedStops: this.completedStops,
      identification: this.identification
    };
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
    this.ensureDetailedVehicle(vehicle, employee);
    if (!this.controller || !this.visual) return;
    this.visual.setVisible(true);
    this.traffic.setReservedSlots(1);
    this.ensureRoute(vehicle.position);
    const route = this.route;
    if (route.length < 2) return;

    const target = this.routePlan.current(this.waypoints) ?? route[route.length - 1];
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
    this.placeDriverLabel(vehicle.position);
    const activeTarget = this.routePlan.current(this.waypoints);
    this.destinationRemaining = activeTarget ? Math.hypot(vehicle.position.x - activeTarget.x, vehicle.position.y - activeTarget.y) : 0;
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
    const activeTarget = this.routePlan.current(this.waypoints);
    this.destinationRemaining = activeTarget ? Math.hypot(vehicle.position.x - activeTarget.x, vehicle.position.y - activeTarget.y) : 0;
    vehicle.updatedAt = new Date().toISOString();
  }

  private ensureDetailedVehicle(vehicle: FleetVehicle, employee: FleetEmployee) {
    if (this.activeVehicleId === vehicle.id && this.controller && this.visual) {
      this.driverLabel?.setText(employeeIdentification(employee.name));
      return;
    }
    this.releaseActiveVehicle();
    this.activeVehicleId = vehicle.id;
    this.controller = new VehicleController(vehicle.position, vehicle.rotation, this.surface);
    this.controller.alignToRoad(false, vehicle.rotation);
    this.visual = this.createFleetVisual(vehicle).setDepth(29);
    this.driverLabel = this.scene.add.text(0, 0, employeeIdentification(employee.name), {
      fontFamily: 'Inter, Arial, sans-serif', fontSize: '12px', fontStyle: '600', color: '#eafff8',
      backgroundColor: '#071722e8', padding: { x: 4, y: 2 }
    }).setOrigin(0.5, 1).setDepth(43).setVisible(false);
    this.route = [];
  }

  private ensureRoute(position: Point) {
    if (this.route.length >= 2 || !this.waypoints.length) return;
    for (let attempt = 0; attempt < this.waypoints.length; attempt += 1) {
      const target = this.routePlan.current(this.waypoints)!;
      this.route = this.router.drivingRoute(position, target);
      if (this.route.length >= 2) break;
      if (Math.hypot(position.x - target.x, position.y - target.y) <= 15) {
        this.route = [{ ...position }, { ...target }];
        break;
      }
      this.routePlan.skipUnreachable(this.waypoints.length);
    }
  }

  private advanceWaypoint(employee: FleetEmployee, vehicle: FleetVehicle) {
    this.route = [];
    const nextStage = this.routePlan.arrive(this.waypoints.length);
    this.completedStops += 1;
    employee.state = nextStage === 'to-destination' ? 'with-passenger' : 'seeking-trip';
    vehicle.state = nextStage === 'to-destination' ? 'on-trip' : 'employee-driving';
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

  private placeDriverLabel(position: Point) {
    if (!this.driverLabel) return;
    const projected = this.project(position);
    const camera = this.scene.cameras.main;
    const cameraRotation = (camera as unknown as { rotation: number }).rotation;
    const inverseZoom = 1 / Math.max(0.1, camera.zoom);
    const offset = 20 * inverseZoom;
    this.driverLabel
      .setPosition(
        projected.x - Math.sin(cameraRotation) * offset,
        projected.y - Math.cos(cameraRotation) * offset
      )
      .setRotation(-cameraRotation)
      .setScale(inverseZoom)
      .setVisible(true);
  }

  private hideDetailedVehicle() {
    if (this.controller && this.activeVehicleId) {
      this.visual?.setVisible(false);
      this.driverLabel?.setVisible(false);
      this.controller = undefined;
      this.activeVehicleId = null;
    }
  }

  private releaseActiveVehicle() {
    this.traffic.setReservedSlots(0);
    this.traffic.setPriorityVehicles([]);
    this.controller = undefined;
    this.visual?.destroy();
    this.driverLabel?.destroy();
    this.visual = undefined;
    this.driverLabel = undefined;
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
  if (closestDistance >= 20) return route;
  const remaining = route.slice(closest + 1);
  return [{ ...position }, ...(remaining.length ? remaining : [{ ...route[route.length - 1] }])];
}
