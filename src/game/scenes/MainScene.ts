import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { loadCityMap } from '../../map/loadCityMap';
import { GraphRouter } from '../../map/routing/GraphRouter';
import { visibleRoadWidth } from '../../map/routing/roadRules';
import type { CityMapData, HudSnapshot, MapSignal, PlayerSave, Point } from '../../types/game';
import { gameEvents, type GameCommand } from '../events';
import { createCarVisual, createPassengerVisual } from '../entities/VehicleVisual';
import { MissionSystem } from '../missions/MissionSystem';
import { RoadSurfaceIndex } from '../systems/RoadSurfaceIndex';
import { steeringForRoute } from '../systems/RouteSteeringAssist';
import { automaticThrottle, missionApproachTargetSpeed } from '../systems/Autopilot';
import { VehicleController, type VehicleInput } from '../systems/VehicleController';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { writeSave } from '../../services/storage/saveService';

type SignalVisual = { signal: MapSignal; graphics: Phaser.GameObjects.Graphics };

export class MainScene extends Phaser.Scene {
  private map?: CityMapData;
  private router?: GraphRouter;
  private vehicle?: VehicleController;
  private vehicleVisual?: Phaser.GameObjects.Container;
  private traffic?: TrafficSystem;
  private mission?: MissionSystem;
  private routeGraphics?: Phaser.GameObjects.Graphics;
  private passengerVisual?: Phaser.GameObjects.Container;
  private destinationVisual?: Phaser.GameObjects.Container;
  private graphGraphics?: Phaser.GameObjects.Graphics;
  private signalVisuals: SignalVisual[] = [];
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private mobileInput: VehicleInput = { throttle: 0, steering: 0, handbrake: false };
  private manuallyPaused = false;
  private initialized = false;
  private pendingSimulationSeconds = 0;
  private simulationSeconds = 0;
  private lastHudUpdate = 0;
  private lastRouteUpdate = 0;
  private offRouteSeconds = 0;
  private routeRecalculations = 0;
  private lastSignalUpdate = 0;
  private collisionEvents = 0;
  private autopilotEnabled = false;
  private autopilotNextMissionAt = 0;
  private autopilotCollisionRecoveryUntil = 0;
  private redLightWarningUntil = 0;
  private unsubscribe?: () => void;
  private save: PlayerSave;
  private cameraMode: 'follow' | 'fixed';
  private cameraRotation = 0;
  private showGraph = false;

  constructor(initialSave: PlayerSave) {
    super('MainScene');
    this.save = initialSave;
    this.cameraMode = initialSave.settings.cameraMode;
  }

  create() {
    this.cameras.main.setBackgroundColor('#8fb878');
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,R') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('wheel', (_pointer: unknown, _objects: unknown, _dx: number, dy: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - dy * 0.0015, GAME_CONFIG.camera.minZoom, GAME_CONFIG.camera.maxZoom));
    });
    this.unsubscribe = gameEvents.on('command', (command) => this.handleCommand(command));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => document.removeEventListener('visibilitychange', this.handleVisibility));
    void this.initialize();
  }

  private handleVisibility = () => {
    if (!document.hidden) return;
    this.mobileInput = { throttle: 0, steering: 0, handbrake: false };
    for (const key of Object.values(this.keys ?? {})) key.reset();
  };

  private async initialize() {
    try {
      this.map = await loadCityMap();
      this.router = new GraphRouter(this.map.graph, this.map.roads);
      const surface = new RoadSurfaceIndex(this.map.roads);
      let spawn = this.router.nearest({ x: 0, y: 0 });
      if (surface.distanceFromRoad(this.save.position) > 3 || Math.hypot(this.save.position.x, this.save.position.y) > 1_600) {
        this.save.position = { x: spawn.x, y: spawn.y };
      } else {
        spawn = this.router.nearest(this.save.position);
      }
      this.renderMap(this.map);
      this.vehicle = new VehicleController(this.save.position, this.save.rotation, surface);
      this.vehicle.alignToRoad(true);
      this.save.position = { ...this.vehicle.position };
      this.save.rotation = this.vehicle.rotation;
      this.vehicleVisual = createCarVisual(this, 0xc97732, true).setScale(0.74);
      this.updateVisualTransform(this.vehicleVisual, this.vehicle.position, this.vehicle.rotation);
      this.cameraRotation = -this.projectedAngle(this.vehicle.rotation) + Math.PI / 2;
      this.cameras.main.setRotation(this.cameraRotation);
      this.cameras.main.startFollow(this.vehicleVisual, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
      this.cameras.main.setZoom(GAME_CONFIG.camera.defaultZoom);
      this.traffic = new TrafficSystem(this, this.map.graph, this.map.roads, this.map.signals, this.project, spawn);
      this.mission = new MissionSystem(this.router, this.vehicle.position, this.save.completedRides);
      this.routeGraphics = this.add.graphics().setDepth(18);
      this.passengerVisual = createPassengerVisual(this).setPosition(0, 0);
      this.destinationVisual = this.createDestinationMarker().setVisible(false);
      this.syncMissionVisuals();
      this.time.addEvent({ delay: GAME_CONFIG.storage.autosaveMs, loop: true, callback: () => this.persist() });
      this.initialized = true;
      this.emitToast('Direção manual livre. Ative o piloto automático acima do menu quando quiser.', 'info');
      this.emitHud();
    } catch (error) {
      console.error(error);
      this.emitToast('Não foi possível carregar o mapa local. Recarregue a página.', 'warning');
    }
  }

  update(time: number, delta: number) {
    if (!this.initialized || !this.vehicle || !this.mission || !this.traffic || !this.vehicleVisual || this.manuallyPaused) return;
    this.pendingSimulationSeconds += Math.min(30, Math.max(0, delta / 1000)) * this.traffic.timeScale;
    let simulationSteps = 0;
    while (this.pendingSimulationSeconds > 0.0001 && simulationSteps < 120) {
      const dt = Math.min(0.05, this.pendingSimulationSeconds);
      this.simulateStep(dt, time);
      this.pendingSimulationSeconds -= dt;
      simulationSteps += 1;
    }

    if (this.mission.mission.phase !== 'completed' && time - this.lastRouteUpdate > 500) {
      this.drawRoute();
      this.lastRouteUpdate = time;
    }
    if (time - this.lastSignalUpdate > 250) {
      this.updateSignals();
      this.lastSignalUpdate = time;
    }
    this.updateVisualTransform(this.vehicleVisual, this.vehicle.position, this.vehicle.rotation);
    if (this.cameraMode === 'follow') {
      const targetRotation = -this.projectedAngle(this.vehicle.rotation) + Math.PI / 2;
      this.cameraRotation = Phaser.Math.Angle.RotateTo(this.cameraRotation, targetRotation, 0.035);
    } else {
      this.cameraRotation = Phaser.Math.Angle.RotateTo(this.cameraRotation, 0, 0.02);
    }
    this.cameras.main.setRotation(this.cameraRotation);
    if (time - this.lastHudUpdate > 100) {
      this.emitHud(time);
      this.lastHudUpdate = time;
    }
    if (this.keys?.R && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.vehicle.reposition();
      this.emitToast('Hatch reposicionado em segurança.', 'info');
    }
  }

  private simulateStep(dt: number, time: number) {
    if (!this.vehicle || !this.mission || !this.traffic) return;
    this.simulationSeconds += dt;
    const input = this.readInput();
    const previousConditionDamage = this.vehicle.conditionDamage;
    const travelled = this.vehicle.update(input, dt, this.save.fuel);
    const fuelDelta = this.vehicle.fuelUsed;
    this.vehicle.fuelUsed = 0;
    this.save.fuel = Math.max(0, this.save.fuel - fuelDelta);
    this.save.condition = Math.max(0, this.save.condition - (this.vehicle.conditionDamage - previousConditionDamage));

    const trafficUpdate = this.traffic.update(
      dt,
      this.vehicle.position,
      this.vehicle.speed,
      this.vehicle.rotation,
      this.autopilotEnabled
    );
    if (trafficUpdate.autopilotDeadlockRecovery) {
      this.vehicle.recoverAutopilotToLane();
      this.mission.recalculate(this.vehicle.position);
      this.syncMissionVisuals();
      this.autopilotCollisionRecoveryUntil = this.simulationSeconds + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
    }
    const collision = this.traffic.handlePlayerCollision(this.vehicle.position, this.autopilotEnabled);
    if (collision.autopilotRecovery) {
      this.vehicle.recoverAutopilotToLane();
      this.mission.recalculate(this.vehicle.position);
      this.syncMissionVisuals();
      this.autopilotCollisionRecoveryUntil = this.simulationSeconds + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
    }
    if (collision.impact) {
      this.vehicle.speed *= 0.55;
      this.save.condition = Math.max(0, this.save.condition - 0.35);
      this.collisionEvents += 1;
      this.emitToast('Batida leve: a condição do Hatch caiu.', 'warning');
    }
    if (this.traffic.checkPlayerRedLight(this.vehicle.position, Math.abs(this.vehicle.speed))) {
      this.save.money = Math.max(0, this.save.money - GAME_CONFIG.traffic.redLightPenalty);
      this.redLightWarningUntil = time + 3_500;
      this.emitToast('Sinal vermelho avançado: -R$ 2,00', 'warning');
    }

    const speedKmh = Math.abs(this.vehicle.speed) * 3.6;
    const missionEvent = this.mission.update(
      this.vehicle.position,
      speedKmh,
      dt,
      travelled,
      this.save.rating,
      this.autopilotEnabled ? GAME_CONFIG.mission.autopilotInteractionRadiusMeters : GAME_CONFIG.mission.interactionRadiusMeters,
      this.autopilotEnabled ? GAME_CONFIG.mission.autopilotMaxInteractionSpeedKmh : GAME_CONFIG.mission.maxInteractionSpeedKmh
    );
    if (missionEvent === 'picked-up') {
      this.emitToast(`${this.mission.mission.passengerName}: ${this.pickLine(GAME_CONFIG.mission.pickupLines)}`, 'success');
      this.syncMissionVisuals();
    } else if (missionEvent === 'completed' && this.mission.receipt) {
      this.save.money += this.mission.receipt.total;
      this.save.xp += this.mission.receipt.xp;
      this.save.rating = this.mission.receipt.rating;
      this.save.completedRides += 1;
      this.traffic.clearPlayerDrivingAdvice();
      if (this.autopilotEnabled) this.autopilotNextMissionAt = time + GAME_CONFIG.mission.newRideDelayMs;
      this.emitToast(
        this.autopilotEnabled
          ? `${this.pickLine(GAME_CONFIG.mission.dropoffLines)} Aguardando a próxima recomendação.`
          : this.pickLine(GAME_CONFIG.mission.dropoffLines),
        'success'
      );
      this.syncMissionVisuals();
      this.persist();
    }

    if (
      this.autopilotEnabled
      && this.mission.mission.phase === 'completed'
      && this.autopilotNextMissionAt > 0
      && time >= this.autopilotNextMissionAt
    ) {
      this.mission.next(this.vehicle.position, this.save.completedRides);
      this.autopilotNextMissionAt = 0;
      this.syncMissionVisuals();
      this.emitToast('Nova corrida recomendada aceita. Indo buscar o cliente.', 'success');
    }

    if (this.mission.mission.phase !== 'completed') {
      const routeDeviation = this.mission.advanceRoute(this.vehicle.position);
      this.offRouteSeconds = routeDeviation > 28 ? this.offRouteSeconds + dt : 0;
      if (this.offRouteSeconds > 2.5) {
        this.mission.recalculate(this.vehicle.position);
        this.routeRecalculations += 1;
        this.offRouteSeconds = 0;
        this.emitToast('Rota recalculada: retomando o caminho principal.', 'info');
      }
    }
  }

  private readInput(): VehicleInput {
    const keyboardThrottle = this.keys
      ? Number(this.keys.W.isDown || this.keys.UP.isDown) - Number(this.keys.S.isDown || this.keys.DOWN.isDown)
      : 0;
    const keyboardSteering = this.keys
      ? Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)
      : 0;
    const throttle = Math.abs(this.mobileInput.throttle) > Math.abs(keyboardThrottle) ? this.mobileInput.throttle : keyboardThrottle;
    const manualSteering = Math.abs(this.mobileInput.steering) > Math.abs(keyboardSteering) ? this.mobileInput.steering : keyboardSteering;
    const handbrake = Boolean(this.keys?.SPACE.isDown) || this.mobileInput.handbrake;
    const manualActivity = Math.abs(throttle) > 0.05 || Math.abs(manualSteering) > 0.05 || handbrake;

    if (this.autopilotEnabled && manualActivity) {
      this.autopilotEnabled = false;
      this.autopilotNextMissionAt = 0;
      this.traffic?.clearPlayerDrivingAdvice();
      this.emitToast('Piloto desligado: controle manual assumido.', 'info');
    }

    if (this.autopilotEnabled && this.vehicle && this.mission && this.traffic) {
      const routeAvailable = this.mission.route.length >= 2;
      const advice = this.traffic.playerDrivingAdvice(
        this.vehicle.position,
        this.vehicle.rotation,
        Math.abs(this.vehicle.speed),
        this.mission.route
      );
      const phase = this.mission.mission.phase;
      const missionDistance = this.mission.targetDistance(this.vehicle.position);
      const insideArrivalArea = missionDistance <= GAME_CONFIG.mission.autopilotInteractionRadiusMeters;
      const missionTargetSpeed = phase === 'completed'
        ? 0
        : insideArrivalArea
          ? 0
        : missionApproachTargetSpeed(
          missionDistance,
          GAME_CONFIG.mission.autopilotInteractionRadiusMeters,
          GAME_CONFIG.vehicle.brakeMps2,
          GAME_CONFIG.vehicle.autopilotCruiseSpeedMps
        );
      const targetSpeed = routeAvailable ? Math.min(advice.targetSpeed, missionTargetSpeed) : 0;
      return {
        throttle: automaticThrottle(Math.abs(this.vehicle.speed), targetSpeed),
        steering: routeAvailable && !insideArrivalArea
          ? steeringForRoute(this.vehicle.position, this.vehicle.rotation, this.vehicle.speed, this.mission.route)
          : 0,
        handbrake: false,
        assistanceEnabled: true
      };
    }

    this.traffic?.clearPlayerDrivingAdvice();
    return {
      throttle,
      steering: manualSteering,
      handbrake,
      assistanceEnabled: false
    };
  }

  private renderMap(map: CityMapData) {
    const ground = this.add.graphics().setDepth(-20);
    ground.fillStyle(0x8fb878).fillRect(-2_000, -1_600, 4_000, 3_200);
    ground.fillStyle(0x7da66d, 0.55);
    for (let index = 0; index < 130; index += 1) {
      const x = ((index * 173) % 2_100) - 1_050;
      const y = ((index * 347) % 2_050) - 1_025;
      const p = this.project({ x, y });
      ground.fillCircle(p.x, p.y, 2.1);
      ground.fillStyle(index % 3 ? 0x3d7848 : 0x557d3a, 0.7).fillCircle(p.x, p.y - 1.7, 3.1);
      ground.fillStyle(0x7da66d, 0.55);
    }

    const buildings = this.add.graphics().setDepth(3);
    for (const building of map.buildings) {
      const points = building.points.map((point) => {
        const projected = this.project(point);
        return new Phaser.Math.Vector2(projected.x, projected.y);
      });
      if (points.length < 3) continue;
      const height = Math.min(10, 1.4 + building.levels * 0.55);
      buildings.fillStyle(0x31485b, 0.24).fillPoints(points.map((point) => new Phaser.Math.Vector2(point.x + height, point.y + height)), true);
      buildings.fillStyle(building.levels > 5 ? 0xc9d2d8 : 0xe5dfd0).fillPoints(points, true);
      buildings.lineStyle(0.55, 0x687987, 0.75).strokePoints(points, true);
    }

    const roads = this.add.graphics().setDepth(8);
    for (const road of map.roads) {
      const width = visibleRoadWidth(road);
      roads.lineStyle(width + 2.2, 0xd7d3c8, 1);
      this.strokeRoad(roads, road.points);
    }
    for (const road of map.roads) {
      const width = visibleRoadWidth(road);
      roads.lineStyle(width, road.highway === 'service' ? 0x5d6570 : 0x454e59, 1);
      this.strokeRoad(roads, road.points);
      if (road.lanes >= 2 && road.points.length > 1) {
        if (!road.oneway) {
          roads.lineStyle(0.38, 0xf8d96a, 0.9);
          this.strokeRoad(roads, road.points);
        }
        const laneWidth = width / road.lanes;
        for (let separator = 1; separator < road.lanes; separator += 1) {
          const offset = -width / 2 + separator * laneWidth;
          if (!road.oneway && Math.abs(offset) < laneWidth * 0.35) continue;
          roads.lineStyle(0.22, 0xe9eef2, 0.58);
          this.strokeRoad(roads, this.offsetRoad(road.points, offset));
        }
      }
    }
    this.renderBusStops(map);
    this.renderSignals(map);

    this.add.text(0, 0, '© OpenStreetMap contributors', {
      fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#f8fafc', backgroundColor: '#102a43aa', padding: { x: 5, y: 3 }
    }).setScrollFactor(0).setPosition(8, this.scale.height - 92).setDepth(1000);
  }

  private strokeRoad(graphics: Phaser.GameObjects.Graphics, points: Point[]) {
    graphics.beginPath();
    points.forEach((point, index) => {
      const projected = this.project(point);
      if (index === 0) graphics.moveTo(projected.x, projected.y); else graphics.lineTo(projected.x, projected.y);
    });
    graphics.strokePath();
  }

  private offsetRoad(points: Point[], offset: number) {
    return points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.hypot(dx, dy);
      return length ? { x: point.x - dy / length * offset, y: point.y + dx / length * offset } : { ...point };
    });
  }

  private renderBusStops(map: CityMapData) {
    for (const [index, stop] of map.busStops.entries()) {
      const p = this.project(stop);
      const container = this.add.container(p.x, p.y).setDepth(22);
      const shelter = this.add.graphics();
      shelter.fillStyle(0x102a43, 0.92).fillRect(-3.7, -4.4, 0.55, 5.4).fillRect(3.2, -4.4, 0.55, 5.4);
      shelter.fillStyle(0x1fb997, 0.9).fillRoundedRect(-4.2, -5, 8.4, 1.1, 0.3);
      shelter.fillStyle(0x8fd3e8, 0.42).fillRect(-3.1, -3.9, 6.2, 3.8);
      shelter.fillStyle(0xf7c948).fillCircle(4.8, -4.3, 1.25);
      container.add(shelter);
      const count = 1 + (index * 3) % 5;
      for (let personIndex = 0; personIndex < count; personIndex += 1) {
        const person = this.add.graphics();
        person.fillStyle(0x5b3b2e).fillCircle(0, -1.5, 0.45);
        person.fillStyle([0xe85d75, 0x4f86c6, 0xf3b33d, 0x704c9f][(index + personIndex) % 4]).fillRoundedRect(-0.45, -1.05, 0.9, 1.7, 0.25);
        person.setPosition(-2.3 + personIndex * 1.1, 1.3);
        container.add(person);
        this.tweens.add({ targets: person, y: person.y - 0.3, duration: 650 + personIndex * 100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
      container.setSize(12, 10).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.emitToast('Empresa de ônibus ainda não adquirida.', 'info');
      });
    }
  }

  private renderSignals(map: CityMapData) {
    for (const signal of map.signals) {
      const p = this.project(signal);
      const graphics = this.add.graphics().setPosition(p.x, p.y).setDepth(26);
      this.signalVisuals.push({ signal, graphics });
    }
    this.updateSignals();
  }

  private updateSignals() {
    if (!this.traffic) return;
    for (const { signal, graphics } of this.signalVisuals) {
      const state = this.traffic.signalState(signal);
      graphics.clear();
      graphics.fillStyle(0x18232e).fillRoundedRect(-1.1, -6.2, 2.2, 5.3, 0.45);
      graphics.fillStyle(0x222b33).fillRect(-0.18, -0.9, 0.36, 4.4);
      graphics.fillStyle(state === 'red' ? 0xff4d4d : 0x512929).fillCircle(0, -5.25, 0.62);
      graphics.fillStyle(state === 'yellow' ? 0xffd23f : 0x514b29).fillCircle(0, -3.65, 0.62);
      graphics.fillStyle(state === 'green' ? 0x2fe081 : 0x264e39).fillCircle(0, -2.05, 0.62);
    }
  }

  private createDestinationMarker() {
    const container = this.add.container(0, 0).setDepth(27);
    const graphics = this.add.graphics();
    graphics.lineStyle(0.65, 0xf8fafc, 0.9).strokeCircle(0, 0, 6.4);
    graphics.lineStyle(1.4, 0x3dd6d0, 0.95).strokeCircle(0, 0, 4.8);
    graphics.fillStyle(0x3dd6d0, 0.18).fillCircle(0, 0, 4.6);
    container.add(graphics);
    this.tweens.add({ targets: container, scale: 1.18, duration: 700, yoyo: true, repeat: -1 });
    return container;
  }

  private syncMissionVisuals() {
    if (!this.mission || !this.passengerVisual || !this.destinationVisual) return;
    const phase = this.mission.mission.phase;
    const pickup = this.project(this.mission.mission.pickup);
    const destination = this.project(this.mission.mission.destination);
    this.passengerVisual.setPosition(pickup.x, pickup.y).setVisible(phase === 'pickup');
    this.destinationVisual.setPosition(destination.x, destination.y).setVisible(phase === 'passenger-on-board');
    this.drawRoute();
  }

  private drawRoute() {
    if (!this.routeGraphics || !this.mission) return;
    this.routeGraphics.clear();
    const route = this.mission.route;
    if (route.length < 2) return;
    this.routeGraphics.lineStyle(2.25, 0x0c2e38, 0.55);
    this.strokeRoad(this.routeGraphics, route);
    this.routeGraphics.lineStyle(1.15, this.mission.mission.phase === 'pickup' ? 0x3fe0a6 : 0x51c9ff, 0.98);
    this.strokeRoad(this.routeGraphics, route);
  }

  private updateVisualTransform(visual: Phaser.GameObjects.Container, position: Point, rotation: number) {
    const projected = this.project(position);
    visual.setPosition(projected.x, projected.y).setRotation(this.projectedAngle(rotation));
  }

  private projectedAngle(rotation: number) {
    const origin = this.project({ x: 0, y: 0 });
    const direction = this.project({ x: Math.cos(rotation), y: Math.sin(rotation) });
    return Math.atan2(direction.y - origin.y, direction.x - origin.x);
  }

  private project = (point: Point): Point => ({
    x: point.x - point.y * GAME_CONFIG.map.projectionSkew,
    y: point.y * GAME_CONFIG.map.projectionYScale
  });

  private handleCommand(command: GameCommand) {
    if (command.type === 'mobile-input') {
      this.mobileInput = { throttle: command.throttle, steering: command.steering, handbrake: command.handbrake };
      return;
    }
    if (command.type === 'pause') {
      this.manuallyPaused = !this.manuallyPaused;
      this.emitToast(this.manuallyPaused ? 'Jogo pausado.' : 'De volta à rota.', 'info');
      return;
    }
    if (command.type === 'autopilot') {
      this.autopilotEnabled = !this.autopilotEnabled;
      if (this.autopilotEnabled) {
        this.mobileInput = { throttle: 0, steering: 0, handbrake: false };
        if (this.vehicle?.engageAutopilot() && this.mission) {
          this.mission.recalculate(this.vehicle.position);
          this.syncMissionVisuals();
        }
        if (this.mission?.mission.phase === 'completed') {
          this.autopilotNextMissionAt = this.time.now + GAME_CONFIG.mission.newRideDelayMs;
        }
      } else {
        this.autopilotNextMissionAt = 0;
      }
      this.traffic?.clearPlayerDrivingAdvice();
      this.emitToast(
        this.autopilotEnabled ? 'Piloto automático ligado. WASD assume o controle manual.' : 'Piloto automático desligado.',
        'info'
      );
      this.emitHud();
      return;
    }
    if (command.type === 'camera') {
      this.cameraMode = this.cameraMode === 'follow' ? 'fixed' : 'follow';
      this.save.settings.cameraMode = this.cameraMode;
      this.emitToast(this.cameraMode === 'follow' ? 'Câmera acompanhando a direção.' : 'Câmera fixa para o norte.', 'info');
      return;
    }
    if (command.type === 'set-quality') {
      this.save.settings.quality = command.quality;
      this.emitToast(`Qualidade: ${command.quality}.`, 'info');
      return;
    }
    if (command.type === 'cancel-ride' && this.mission) {
      const penalized = this.mission.cancel();
      if (penalized) this.save.money = Math.max(0, this.save.money - GAME_CONFIG.fare.cancellationPenalty);
      this.emitToast(penalized ? 'Corrida cancelada: -R$ 3,00' : 'Corrida cancelada.', 'warning');
      this.mission.next(this.vehicle?.position ?? { x: 0, y: 0 }, this.save.completedRides + 1);
      this.syncMissionVisuals();
      return;
    }
    if (command.type === 'dismiss-receipt' && this.mission && this.vehicle) {
      this.mission.next(this.vehicle.position, this.save.completedRides);
      this.autopilotNextMissionAt = 0;
      this.syncMissionVisuals();
      return;
    }
    if (command.type === 'dev') this.handleDevAction(command.action);
  }

  private handleDevAction(action: string) {
    if (!import.meta.env.DEV || !this.vehicle || !this.mission || !this.traffic) return;
    if (action === 'money-add') this.save.money += 1_000;
    if (action === 'money-remove') this.save.money = Math.max(0, this.save.money - 100);
    if (action === 'refuel') this.save.fuel = GAME_CONFIG.vehicle.fuelCapacityLiters;
    if (action === 'repair') this.save.condition = 100;
    if (action === 'teleport-pickup') this.vehicle.teleport(this.mission.mission.pickup);
    if (action === 'teleport-destination') this.vehicle.teleport(this.mission.mission.destination);
    if (action === 'complete') {
      if (this.mission.mission.phase === 'pickup') this.vehicle.teleport(this.mission.mission.pickup);
      else this.vehicle.teleport(this.mission.mission.destination);
    }
    if (action === 'generate') {
      this.mission.next(this.vehicle.position, this.save.completedRides + 1);
      this.syncMissionVisuals();
    }
    if (action === 'traffic') this.traffic.enabled = !this.traffic.enabled;
    if (action === 'signals') this.traffic.signalsEnabled = !this.traffic.signalsEnabled;
    if (action === 'traffic-ahead') this.traffic.debugPlaceVehicle(this.vehicle.position, this.vehicle.rotation, 16);
    if (action === 'traffic-collision') this.traffic.debugPlaceVehicle(this.vehicle.position, this.vehicle.rotation, 0);
    if (action === 'traffic-head-on') this.traffic.debugPlaceHeadOnVehicle(this.vehicle.position, this.vehicle.rotation);
    if (action === 'taxi') this.emitToast('Táxi desbloqueado temporariamente para testes.', 'success');
    if (action === 'time') this.traffic.timeScale = this.traffic.timeScale === 1 ? 2 : this.traffic.timeScale === 2 ? 0.5 : 1;
    if (action === 'graph') {
      this.showGraph = !this.showGraph;
      this.renderDebugGraph();
    }
    if (action === 'colliders') this.emitToast('Colisores de pista: limite claro das vias.', 'info');
    if (action === 'reset') localStorage.clear();
    this.emitHud();
  }

  private renderDebugGraph() {
    this.graphGraphics?.destroy();
    if (!this.showGraph || !this.map) return;
    this.graphGraphics = this.add.graphics().setDepth(50).lineStyle(0.25, 0x24f2ff, 0.45);
    for (const node of this.map.graph.nodes) {
      const from = this.project(node);
      for (const edge of node.edges.slice(0, 2)) {
        const target = this.map.graph.nodes.find((candidate) => candidate.id === edge.to);
        if (target) {
          const to = this.project(target);
          this.graphGraphics.lineBetween(from.x, from.y, to.x, to.y);
        }
      }
    }
  }

  private emitHud(time = 0) {
    if (!this.vehicle || !this.mission) return;
    const phase = this.mission.mission.phase;
    const target = phase === 'pickup' ? this.mission.mission.pickup : this.mission.mission.destination;
    const desiredAngle = Math.atan2(target.y - this.vehicle.position.y, target.x - this.vehicle.position.x);
    const distanceRemaining = this.mission.remainingDistance(this.vehicle.position);
    const trafficStats = this.traffic?.stats() ?? {
      total: 0, buses: 0, utility: 0, stunned: 0, ghosted: 0, deadlockRecoveries: 0, brakeReason: 'clear' as const
    };
    const snapshot: HudSnapshot = {
      ready: this.initialized,
      money: this.save.money,
      speedKmh: Math.abs(this.vehicle.speed) * 3.6,
      fuel: this.save.fuel,
      fuelCapacity: GAME_CONFIG.vehicle.fuelCapacityLiters,
      condition: this.save.condition,
      objective: phase === 'pickup'
        ? `Busque ${this.mission.mission.passengerName} • ${this.mission.mission.pickupLabel}`
        : phase === 'passenger-on-board'
          ? `Leve até ${this.mission.mission.destinationLabel}`
          : 'Corrida concluída',
      distanceRemaining,
      etaSeconds: distanceRemaining / 9,
      headingDelta: Phaser.Math.Angle.Wrap(desiredAngle - this.vehicle.rotation),
      vehicleHeading: this.vehicle.rotation,
      fps: Math.round(this.game.loop.actualFps),
      redLightWarning: time < this.redLightWarningUntil,
      trafficVehicles: trafficStats.total,
      trafficBuses: trafficStats.buses,
      trafficStunned: trafficStats.stunned,
      trafficGhosted: trafficStats.ghosted,
      autopilotDeadlockRecoveries: trafficStats.deadlockRecoveries,
      collisionEvents: this.collisionEvents,
      autopilotEnabled: this.autopilotEnabled,
      autopilotNextMissionSeconds: this.autopilotNextMissionAt > 0
        ? Math.max(0, Math.ceil((this.autopilotNextMissionAt - (time || this.time.now)) / 1_000))
        : 0,
      autopilotRoadCorrections: this.vehicle.autopilotRoadCorrections,
      autopilotMinRoadClearance: Number.isFinite(this.vehicle.minimumAutopilotRoadClearance)
        ? this.vehicle.minimumAutopilotRoadClearance
        : this.vehicle.roadEdgeClearance(),
      simulationSeconds: this.simulationSeconds,
      autopilotCollisionRecovery: this.simulationSeconds < this.autopilotCollisionRecoveryUntil,
      autoBrakeReason: trafficStats.brakeReason,
      routeRecalculations: this.routeRecalculations,
      mission: this.mission.mission,
      receipt: this.mission.receipt
    };
    gameEvents.emit('hud', snapshot);
  }

  private emitToast(message: string, tone: 'info' | 'success' | 'warning') {
    gameEvents.emit('toast', { message, tone });
  }

  private persist() {
    if (!this.vehicle) return;
    this.save = writeSave({ ...this.save, position: { ...this.vehicle.position }, rotation: this.vehicle.rotation });
    gameEvents.emit('save', this.save);
  }

  private pickLine(lines: readonly string[]) {
    return lines[this.save.completedRides % lines.length];
  }
}
