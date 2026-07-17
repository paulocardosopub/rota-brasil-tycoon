import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import { CityMapStream } from '../../map/loadCityMap';
import { localMetersToLatLon } from '../../map/projection/localMeters';
import { GraphRouter } from '../../map/routing/GraphRouter';
import { visibleRoadWidth } from '../../map/routing/roadRules';
import type { CollisionSeverity, CityMapData, FleetReport, HudSnapshot, MapServiceLocation, MapSignal, PlayerSave, Point } from '../../types/game';
import { gameEvents, type GameCommand } from '../events';
import { createCarVisual, createPassengerVisual } from '../entities/VehicleVisual';
import { MissionSystem } from '../missions/MissionSystem';
import { RoadSurfaceIndex } from '../systems/RoadSurfaceIndex';
import { advanceActiveRoute } from '../systems/RouteProgress';
import { guidanceForRoute } from '../systems/RouteSteeringAssist';
import { automaticThrottle, missionApproachTargetSpeed } from '../systems/Autopilot';
import { VehicleController, type VehicleInput } from '../systems/VehicleController';
import { TrafficSystem } from '../traffic/TrafficSystem';
import { writeSave } from '../../services/storage/saveService';
import { GameAudio } from '../audio/GameAudio';
import { EconomyService } from '../economy/EconomyService';
import { fuelPurchaseCost, upgradeEffects, upgradePrice, workshopPrice, type WorkshopServiceId } from '../economy/ExpenseCalculator';
import { ECONOMY_CONFIG } from '../economy/EconomyConfig';
import { serviceAccessDistance, ServiceSystem } from '../services/ServiceSystem';
import { AirTrafficSystem } from '../environment/AirTrafficSystem';
import { refreshProgression } from '../progression/DriverProgression';
import { simulateEconomy } from '../economy/EconomySimulator';
import { TaxiPointSystem } from '../taxi/TaxiPointSystem';
import { finishTaxiMeter, markTaxiBoarding, prepareTaxiMeter, resetTaxiMeter, startTaxiMeter, updateTaxiMeter } from '../taxi/TaxiMeter';
import { convertActiveVehicleToTaxi, regularizeTaxi } from '../progression/RegularizationService';
import {
  acknowledgeFleetReport, advanceFleetShift, assignEmployee, dismissEmployee, endFleetShift,
  hireEmployee, purchaseSecondVehicle, selectPlayerVehicle, simulateOfflineReturn,
  startFleetShift, syncActiveVehicleFromLegacy, unassignEmployee
} from '../fleet/FleetService';
import { FleetVehicleSystem } from '../fleet/FleetVehicleSystem';
import { roundMoney } from '../economy/TransactionLedger';
import { OnlineWorldClient, type LocalMovementState } from '../../online/OnlineWorldClient';
import { RemoteVehicleSystem } from '../../online/RemoteVehicleSystem';

type SignalVisual = { signal: MapSignal; graphics: Phaser.GameObjects.Graphics };
const DETAILED_ROAD_MARKINGS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link']);

export class MainScene extends Phaser.Scene {
  private map?: CityMapData;
  private mapStream?: CityMapStream;
  private mapStreamLoading = false;
  private mapVisuals: Phaser.GameObjects.GameObject[] = [];
  private mapRenderCenter: Point | null = null;
  private router?: GraphRouter;
  private vehicle?: VehicleController;
  private vehicleVisual?: Phaser.GameObjects.Container;
  private traffic?: TrafficSystem;
  private mission?: MissionSystem;
  private services?: ServiceSystem;
  private airTraffic?: AirTrafficSystem;
  private taxiPoints?: TaxiPointSystem;
  private fleetVehicles?: FleetVehicleSystem;
  private roadSurface?: RoadSurfaceIndex;
  private serviceRoute: Point[] = [];
  private serviceArrived = false;
  private emergencyFuelGranted = false;
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
  private collisionSeverity: CollisionSeverity | null = null;
  private collisionRelativeSpeedKmh = 0;
  private collisionFeedbackUntil = 0;
  private autopilotEnabled = false;
  private autopilotState: HudSnapshot['autopilotState'] = 'off';
  private autopilotTargetSpeedKmh = 0;
  private autopilotNextMissionAt = 0;
  private autopilotCollisionRecoveryUntil = 0;
  private autopilotStuckSeconds = 0;
  private redLightWarningUntil = 0;
  private unsubscribe?: () => void;
  private save: PlayerSave;
  private cameraMode: 'follow' | 'fixed';
  private cameraRotation = 0;
  private showGraph = false;
  private readonly audio = new GameAudio();
  private repositionProgress = 0;
  private repositionConsumed = false;
  private followFleetVehicle = false;
  private fleetReportNotifiedId: string | null = null;
  private offlineReport?: FleetReport | null;
  private online?: OnlineWorldClient;
  private remoteVehicles?: RemoteVehicleSystem;
  private lastOnlineSpeed = 0;
  private lastOnlineUpdateAt = 0;
  private onlineUnsubscribers: Array<() => void> = [];
  private debugOnlineLatencyMs = 0;
  private debugOnlineLossRate = 0;

  constructor(initialSave: PlayerSave) {
    super('MainScene');
    this.save = initialSave;
    this.cameraMode = initialSave.settings.cameraMode;
    this.autopilotEnabled = initialSave.autopilotEnabled;
  }

  create() {
    this.cameras.main.setBackgroundColor('#8fb878');
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,R,H') as Record<string, Phaser.Input.Keyboard.Key>;
    const unlockAudio = () => this.audio.unlock(this.save.settings);
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    this.input.on('wheel', (_pointer: unknown, _objects: unknown, _dx: number, dy: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - dy * 0.0015, GAME_CONFIG.camera.minZoom, GAME_CONFIG.camera.maxZoom));
    });
    this.unsubscribe = gameEvents.on('command', (command) => this.handleCommand(command));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      for (const unsubscribe of this.onlineUnsubscribers) unsubscribe();
      this.onlineUnsubscribers = [];
      this.remoteVehicles?.destroy();
      void this.online?.stop();
    });
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      document.removeEventListener('visibilitychange', this.handleVisibility);
      this.audio.destroy();
    });
    void this.initialize();
  }

  private handleVisibility = () => {
    if (!document.hidden) return;
    this.mobileInput = { throttle: 0, steering: 0, handbrake: false };
    for (const key of Object.values(this.keys ?? {})) key.reset();
  };

  private async initialize() {
    try {
      this.offlineReport = simulateOfflineReturn(this.save);
      this.mapStream = await CityMapStream.create();
      this.map = await this.mapStream.windowAt(this.save.position);
      this.router = new GraphRouter(this.map.graph, this.map.roads);
      const surface = new RoadSurfaceIndex(this.map.roads);
      this.roadSurface = surface;
      let spawn = this.router.nearest(this.save.position);
      const recoveryPosition = surface.distanceFromRoad(this.save.position) <= 12
        ? this.save.position
        : this.save.lastSafePosition;
      const routeStart = this.router.routeStart(recoveryPosition, this.save.rotation);
      if (surface.distanceFromRoad(recoveryPosition) > 12 || !routeStart) {
        // Some OSM fragments are visually valid roads but are physically
        // isolated from the city graph. Recover onto the closest published
        // lane so GPS/autopilot never draw a shortcut across grass.
        this.save.position = this.router.nearestRoutePoint(recoveryPosition);
        spawn = this.router.nearest(this.save.position);
      } else {
        this.save.position = { ...recoveryPosition };
        spawn = this.router.nearest(recoveryPosition);
      }
      this.renderMap(this.map);
      this.vehicle = new VehicleController(this.save.position, this.save.rotation, surface);
      this.vehicle.setModifiers(upgradeEffects(this.save.upgrades));
      this.vehicle.alignToRoad(true);
      this.save.position = { ...this.vehicle.position };
      this.save.rotation = this.vehicle.rotation;
      this.vehicleVisual = this.createPlayerVehicleVisual();
      this.updateVisualTransform(this.vehicleVisual, this.vehicle.position, this.vehicle.rotation);
      this.cameraRotation = -this.projectedAngle(this.vehicle.rotation) + Math.PI / 2;
      this.cameras.main.setRotation(this.cameraRotation);
      this.cameras.main.startFollow(this.vehicleVisual, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
      this.cameras.main.setZoom(GAME_CONFIG.camera.zoomPresets[this.save.settings.cameraZoom]);
      this.traffic = new TrafficSystem(this, this.map.graph, this.map.roads, this.map.signals, this.project, spawn);
      this.traffic.setDensity(this.save.settings.trafficDensity);
      this.mission = new MissionSystem(this.router, this.vehicle.position, this.save.completedRides, this.save.activeMission, {
        condition: this.save.condition,
        comfortLevel: this.save.upgrades.comfort,
        rating: this.save.rating,
        taxiLicensed: this.activeFleetVehicle()?.taxiLicensed === true,
        taxiPoints: this.map.taxiPoints,
        regions: this.map.manifest?.regions
      });
      if (this.mission.mission.phase === 'pickup' || this.mission.mission.phase === 'passenger-on-board') {
        this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
      }
      this.services = new ServiceSystem(this, this.map.services, this.project);
      this.taxiPoints = new TaxiPointSystem(this, this.map.taxiPoints, this.project);
      const garage = this.map.services.find((service) => service.id === this.save.fleet.garageServiceId)?.entrance ?? { x: -744.43, y: 55.13 };
      this.fleetVehicles = new FleetVehicleSystem(this, this.router, surface, this.traffic, this.project, this.map.taxiPoints, garage);
      this.online = new OnlineWorldClient(this.save);
      this.remoteVehicles = new RemoteVehicleSystem(this, this.traffic, this.project);
      this.onlineUnsubscribers.push(
        this.online.onSnapshot((snapshot, presence) => this.remoteVehicles?.receive(snapshot, presence)),
        this.online.onPresence((profiles) => this.remoteVehicles?.updateProfiles(profiles)),
        this.online.onConnection((state) => {
          if (state === 'SOLO' || state === 'SOLO_TEMPORARY' || state === 'OFFLINE') this.remoteVehicles?.clear();
        })
      );
      this.airTraffic = new AirTrafficSystem(this);
      this.routeGraphics = this.add.graphics().setDepth(18);
      this.passengerVisual = createPassengerVisual(this).setPosition(0, 0);
      this.destinationVisual = this.createDestinationMarker().setVisible(false);
      this.restoreTaxiMeterState();
      this.syncMissionVisuals();
      this.time.addEvent({ delay: GAME_CONFIG.storage.autosaveMs, loop: true, callback: () => this.persist() });
      this.initialized = true;
      const mapLocation = this.mapStream.location(this.vehicle.position);
      this.save.currentChunk = mapLocation.chunkId;
      this.save.currentRegion = mapLocation.region.name;
      void this.online.start(mapLocation.chunkId, this.adjacentChunks(mapLocation.chunkId));
      if (this.save.mapMigrationNotice) {
        this.save.mapMigrationNotice = false;
        this.emitToast('Mapa atualizado: o veículo foi alinhado à faixa válida mais próxima.', 'info');
      } else if (this.offlineReport) {
        this.fleetReportNotifiedId = this.offlineReport.id;
        this.emitToast(`Relatório da frota: ${this.offlineReport.rides} corridas, lucro ${this.formatMoney(this.offlineReport.netProfit)}.`, 'success');
      } else this.emitToast('Direção manual livre. Ative o piloto automático acima do menu quando quiser.', 'info');
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
    this.services?.update(this.simulationSeconds);
    this.taxiPoints?.update(this.simulationSeconds);
    this.airTraffic?.update(Math.min(0.1, delta / 1000), this.simulationSeconds);
    this.updateMapStreaming();
    if (this.remoteVehicles?.count()) this.remoteVehicles.update(Date.now(), this.vehicle.position, this.save.settings);
    if (this.online?.isOnline()) this.publishOnlineMovement();

    if ((this.mission.mission.phase !== 'completed' || this.services?.selected) && time - this.lastRouteUpdate > 500) {
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
    if (this.keys?.R?.isDown && !this.repositionConsumed) {
      this.repositionProgress = Math.min(1, this.repositionProgress + delta / 1000 / GAME_CONFIG.vehicle.repositionHoldSeconds);
      if (this.repositionProgress >= 1) {
        this.vehicle.reposition();
        new EconomyService(this.save).expense(
          GAME_CONFIG.vehicle.repositionFee, 'reposition', 'Reposicionamento seguro',
          `reposition-${Math.floor(this.simulationSeconds)}`, true
        );
        this.repositionConsumed = true;
        this.emitToast('Hatch reposicionado em segurança • taxa R$ 1,00.', 'info');
        this.persist();
      }
    } else if (!this.keys?.R?.isDown) {
      this.repositionProgress = 0;
      this.repositionConsumed = false;
    }
    if (this.keys?.H && Phaser.Input.Keyboard.JustDown(this.keys.H)) this.audio.horn();
  }

  private simulateStep(dt: number, time: number) {
    if (!this.vehicle || !this.mission || !this.traffic) return;
    this.simulationSeconds += dt;
    const fleetResult = advanceFleetShift(this.save, dt);
    if (fleetResult.report && fleetResult.report.id !== this.fleetReportNotifiedId) {
      this.fleetReportNotifiedId = fleetResult.report.id;
      this.emitToast(`Turno encerrado: ${fleetResult.report.rides} corridas, lucro ${this.formatMoney(fleetResult.report.netProfit)}.`, 'success');
      this.persist();
    }
    const input = this.readInput();
    this.audio.update(this.vehicle.speed, input.throttle, input.handbrake || input.throttle < 0, this.save.settings);
    const previousPosition = { ...this.vehicle.position };
    const travelled = this.vehicle.update(input, dt, this.save.fuel);
    const fuelDelta = this.vehicle.fuelUsed;
    this.vehicle.fuelUsed = 0;
    this.save.fuel = Math.max(0, this.save.fuel - fuelDelta);
    this.save.totalKm += travelled / 1000;
    const aggressive = Math.abs(input.steering) > 0.72 && Math.abs(this.vehicle.speed) > 12
      || Math.abs(input.throttle) > 0.9 && Math.abs(this.vehicle.speed) > 18;
    this.save.maintenanceWear = Math.min(100, this.save.maintenanceWear
      + travelled / 1000 * ECONOMY_CONFIG.wear.perKilometer * (aggressive ? ECONOMY_CONFIG.wear.aggressiveMultiplier : 1));
    this.save.condition = vehicleCondition(this.save.collisionDamage, this.save.maintenanceWear);
    const recoveryRoute = this.activeRoute();
    const recoveryArrivalRadius = this.services?.selected
      ? GAME_CONFIG.services.interactionRadiusMeters
      : GAME_CONFIG.mission.autopilotInteractionRadiusMeters;
    const blockedForRecklessRecovery = this.autopilotEnabled
      && recoveryRoute.length >= 2
      && this.navigationDistance() > recoveryArrivalRadius + 2
      && this.save.fuel > 0
      && Math.abs(this.vehicle.speed) < 1.2
      && travelled < 0.015
      && this.traffic.stats().brakeReason !== 'red-signal'
      && this.simulationSeconds >= this.autopilotCollisionRecoveryUntil;
    const playerRecovery = this.traffic.updatePlayerRecovery(
      dt,
      blockedForRecklessRecovery,
      travelled,
      this.vehicle.position,
      this.vehicle.rotation
    );
    if (playerRecovery.started) {
      const guidance = guidanceForRoute(
        this.vehicle.position,
        this.vehicle.rotation,
        this.vehicle.speed,
        recoveryRoute,
        GAME_CONFIG.vehicle.autopilotCruiseSpeedMps,
        GAME_CONFIG.vehicle.brakeMps2
      );
      this.vehicle.recoverAutopilotToLane(guidance.preferredRoadHeading);
      this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
      this.syncMissionVisuals();
      this.autopilotCollisionRecoveryUntil = this.simulationSeconds + GAME_CONFIG.traffic.stuckRecoveryMaximumSeconds;
      this.emitToast('Destravamento automático: saindo da fila com prioridade temporária.', 'warning');
    }
    this.fleetVehicles?.update(this.save, this.vehicle.position, dt);
    const fleetCollision = this.fleetVehicles?.handlePlayerCollision(
      this.vehicle.position,
      this.vehicle.speed,
      this.autopilotEnabled && this.traffic.playerRecoveryActive()
    );
    if (fleetCollision?.impact) {
      this.vehicle.speed *= 0.45;
      this.save.collisionDamage = Math.min(100, this.save.collisionDamage + Math.min(1.4, fleetCollision.relativeSpeedKmh / 45));
      this.save.condition = vehicleCondition(this.save.collisionDamage, this.save.maintenanceWear);
      this.mission.recordCollision();
      this.emitToast('Contato com o veículo da frota. Ambos reduziram para se separar.', 'warning');
    }
    const remoteCollision = !this.traffic.playerRecoveryActive() && this.remoteVehicles?.count()
      ? this.remoteVehicles.handlePlayerCollision(this.vehicle.position, this.vehicle.speed)
      : undefined;
    if (remoteCollision?.impact) {
      this.vehicle.speed *= remoteCollision.retainedSpeed;
      this.emitToast('Contato online corrigido com segurança. Nenhum custo foi aplicado.', 'warning');
    }
    if (this.save.fuel <= 0.0001 && !this.emergencyFuelGranted) {
      new EconomyService(this.save).expense(
        GAME_CONFIG.services.emergencyFuelFee, 'emergency', 'Combustível de emergência',
        `emergency-fuel-${Math.floor(this.simulationSeconds)}`, true,
        { liters: GAME_CONFIG.services.emergencyFuelLiters }
      );
      this.save.fuel = GAME_CONFIG.services.emergencyFuelLiters;
      this.emergencyFuelGranted = true;
      this.emitToast('Socorro abasteceu 3 L. A taxa entrou no caixa ou na dívida.', 'warning');
    } else if (this.save.fuel > 5) this.emergencyFuelGranted = false;

    const trafficUpdate = this.traffic.update(
      dt,
      this.vehicle.position,
      this.vehicle.speed,
      this.vehicle.rotation,
      this.autopilotEnabled
    );
    if (trafficUpdate.autopilotDeadlockRecovery) {
      this.vehicle.recoverAutopilotToLane(input.assistanceHeading);
      this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
      this.syncMissionVisuals();
      this.autopilotCollisionRecoveryUntil = this.simulationSeconds + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
    }
    const collision = this.traffic.handlePlayerCollision(
      previousPosition,
      this.vehicle.position,
      this.vehicle.speed,
      this.vehicle.rotation,
      this.autopilotEnabled
    );
    if (collision.autopilotRecovery) {
      this.vehicle.recoverAutopilotToLane(input.assistanceHeading);
      this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
      this.syncMissionVisuals();
      this.autopilotCollisionRecoveryUntil = this.simulationSeconds + GAME_CONFIG.traffic.autopilotCollisionGhostSeconds;
    }
    if (collision.impact) {
      if (collision.resolvedPosition) this.vehicle.resolveCollision(collision.resolvedPosition);
      this.vehicle.speed *= collision.retainedSpeed;
      this.save.collisionDamage = Math.min(100, this.save.collisionDamage + collision.conditionDamage);
      this.save.condition = vehicleCondition(this.save.collisionDamage, this.save.maintenanceWear);
      this.mission.recordCollision();
      this.collisionEvents += 1;
      this.collisionSeverity = collision.severity;
      this.collisionRelativeSpeedKmh = collision.relativeSpeedKmh;
      this.collisionFeedbackUntil = this.simulationSeconds + 3;
      this.showCollisionFeedback(collision.severity, collision.relativeSpeedKmh);
      this.audio.collision(collision.severity);
      this.emitToast(collisionMessage(collision.severity, collision.relativeSpeedKmh), collision.severity === 'contact' ? 'info' : 'warning');
    }
    if (!collision.impact && this.traffic.checkPlayerRedLight(previousPosition, this.vehicle.position, Math.abs(this.vehicle.speed))) {
      new EconomyService(this.save).expense(
        GAME_CONFIG.traffic.redLightPenalty, 'fine', 'Infração de sinal vermelho',
        `red-light-${Math.floor(this.simulationSeconds / 3)}`
      );
      this.mission.recordRedLight();
      this.redLightWarningUntil = time + 3_500;
      this.audio.signal();
      this.emitToast('Sinal vermelho avançado: -R$ 2,00', 'warning');
    }

    const speedKmh = Math.abs(this.vehicle.speed) * 3.6;
    if (this.mission.mission.rideMode === 'official-taxi' && this.mission.mission.phase === 'passenger-on-board') {
      updateTaxiMeter(this.save.taxiMeter, travelled, dt, speedKmh);
    }
    const missionEvent = this.mission.update(
      this.vehicle.position,
      speedKmh,
      dt,
      travelled,
      this.save.rating,
      this.autopilotEnabled ? GAME_CONFIG.mission.autopilotInteractionRadiusMeters : GAME_CONFIG.mission.interactionRadiusMeters,
      this.autopilotEnabled ? GAME_CONFIG.mission.autopilotMaxInteractionSpeedKmh : GAME_CONFIG.mission.maxInteractionSpeedKmh,
      this.vehicle.rotation
    );
    if (missionEvent === 'picked-up') {
      if (this.mission.mission.rideMode === 'official-taxi') {
        markTaxiBoarding(this.save.taxiMeter);
        startTaxiMeter(this.save.taxiMeter);
      }
      this.emitToast(`${this.mission.mission.passengerName}: ${this.pickLine(GAME_CONFIG.mission.pickupLines)}`, 'success');
      this.syncMissionVisuals();
    } else if (missionEvent === 'completed' && this.mission.receipt) {
      const receipt = this.mission.receipt;
      if (this.mission.mission.rideMode === 'official-taxi') {
        const meteredFare = finishTaxiMeter(this.save.taxiMeter);
        const tip = receipt.tip ?? 0;
        receipt.baseFare = GAME_CONFIG.taxi.meter.initialFare;
        receipt.distanceFare = roundMoney(this.save.taxiMeter.distanceMeters / 1_000 * GAME_CONFIG.taxi.meter.perKilometer);
        receipt.timeFare = roundMoney(this.save.taxiMeter.waitingSeconds / 60 * GAME_CONFIG.taxi.meter.waitingPerMinute);
        receipt.guaranteedTotal = meteredFare;
        receipt.qualityBonus = 0;
        receipt.total = roundMoney(meteredFare + tip);
        this.save.officialTaxiRides += 1;
      }
      const tip = receipt.tip ?? 0;
      const economy = new EconomyService(this.save);
      economy.income(receipt.total - tip, 'ride', 'Pagamento de corrida', `ride-payment-${this.mission.mission.id}`, this.mission.mission.id, {
        category: this.mission.mission.category ?? 'popular', rating: receipt.rating
      });
      if (tip > 0) economy.income(tip, 'tip', 'Gorjeta do passageiro', `ride-tip-${this.mission.mission.id}`, this.mission.mission.id);
      this.save.xp += this.mission.receipt.xp;
      this.save.rating = Math.round((this.save.rating * 0.82 + receipt.rating * 0.18) * 100) / 100;
      this.save.completedRides += 1;
      this.save.tipsEarned += tip;
      this.save.ratingHistory = [...this.save.ratingHistory, receipt.rating].slice(-30);
      this.save.rideHistory = [{
        id: this.mission.mission.id,
        passengerName: this.mission.mission.passengerName,
        category: this.mission.mission.category ?? 'popular',
        total: receipt.total,
        tip,
        rating: receipt.rating,
        distanceKm: receipt.distanceKm,
        completedAt: new Date().toISOString()
      }, ...this.save.rideHistory].slice(0, GAME_CONFIG.storage.rideHistoryLimit);
      if ((this.mission.mission.quality?.collisions ?? 0) === 0) this.save.goals.collisionFreeRide = true;
      refreshProgression(this.save);
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
      if (this.mission.accept(this.vehicle.position, this.vehicle.rotation)) this.prepareAcceptedTaxiRide();
      this.autopilotNextMissionAt = 0;
      this.syncMissionVisuals();
      this.emitToast('Nova corrida recomendada aceita. Indo buscar o cliente.', 'success');
    }

    if (!this.services?.selected && (this.mission.mission.phase === 'pickup' || this.mission.mission.phase === 'passenger-on-board')) {
      const routeDeviation = this.mission.advanceRoute(this.vehicle.position);
      this.offRouteSeconds = routeDeviation > 28 ? this.offRouteSeconds + dt : 0;
      if (this.offRouteSeconds > 2.5) {
        this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
        this.routeRecalculations += 1;
        this.offRouteSeconds = 0;
        this.emitToast('Rota recalculada: retomando o caminho principal.', 'info');
      }
    }
    this.mission.recordDrivingQuality(dt, this.offRouteSeconds > 0, aggressive);

    if (this.services?.selected && this.serviceRoute.length) {
      const serviceDistance = serviceAccessDistance(this.services.selected, this.vehicle.position);
      this.serviceRoute = advanceActiveRoute(this.serviceRoute, this.vehicle.position, 28).route;
      if (serviceDistance <= GAME_CONFIG.services.interactionRadiusMeters && Math.abs(this.vehicle.speed) * 3.6 <= GAME_CONFIG.services.maximumInteractionSpeedKmh) {
        this.serviceRoute = [];
        if (!this.serviceArrived) {
          this.serviceArrived = true;
          this.emitToast(`Chegou a ${this.services.selected.gameName}. Escolha e confirme o serviço.`, 'success');
        }
      }
    }

    const shouldRecoverStuckAutopilot = this.autopilotEnabled
      && this.activeRoute().length >= 2
      && input.throttle > 0.15
      && this.save.fuel > 0
      && Math.abs(this.vehicle.speed) < 1.2
      && travelled < 0.015
      && this.simulationSeconds >= this.autopilotCollisionRecoveryUntil;
    this.autopilotStuckSeconds = shouldRecoverStuckAutopilot ? this.autopilotStuckSeconds + dt : 0;
    if (this.autopilotStuckSeconds >= 2.2) {
      const guidance = guidanceForRoute(
        this.vehicle.position,
        this.vehicle.rotation,
        this.vehicle.speed,
        this.activeRoute(),
        GAME_CONFIG.vehicle.autopilotCruiseSpeedMps,
        GAME_CONFIG.vehicle.brakeMps2
      );
      if (this.vehicle.recoverAutopilotToLane(guidance.preferredRoadHeading)) {
        this.mission.advanceRoute(this.vehicle.position);
        this.offRouteSeconds = 0;
      }
      this.autopilotStuckSeconds = 0;
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
      this.autopilotState = 'off';
      this.autopilotTargetSpeedKmh = 0;
      this.autopilotNextMissionAt = 0;
      this.autopilotStuckSeconds = 0;
      this.traffic?.resetPlayerRecovery();
      this.traffic?.clearPlayerDrivingAdvice();
      this.emitToast('Piloto desligado: controle manual assumido.', 'info');
    }

    if (this.autopilotEnabled && this.vehicle && this.mission && this.traffic) {
      if (this.mission.mission.phase === 'offered' && !this.services?.selected) {
        if (this.mission.accept(this.vehicle.position, this.vehicle.rotation)) this.prepareAcceptedTaxiRide();
        this.syncMissionVisuals();
      }
      const activeRoute = this.activeRoute();
      const routeAvailable = activeRoute.length >= 2;
      const advice = this.traffic.playerDrivingAdvice(
        this.vehicle.position,
        this.vehicle.rotation,
        Math.abs(this.vehicle.speed),
        activeRoute
      );
      const phase = this.mission.mission.phase;
      const navigationDistance = this.navigationDistance();
      const arrivalRadius = this.services?.selected ? GAME_CONFIG.services.interactionRadiusMeters : GAME_CONFIG.mission.autopilotInteractionRadiusMeters;
      const insideArrivalArea = navigationDistance <= arrivalRadius;
      const navigationCompleted = phase === 'completed' && !this.services?.selected;
      const missionTargetSpeed = navigationCompleted
        ? 0
        : insideArrivalArea
          ? 0
        : missionApproachTargetSpeed(
          navigationDistance,
          arrivalRadius,
          GAME_CONFIG.vehicle.brakeMps2,
          GAME_CONFIG.vehicle.autopilotCruiseSpeedMps
        );
      const guidance = routeAvailable
        ? guidanceForRoute(
          this.vehicle.position,
          this.vehicle.rotation,
          this.vehicle.speed,
          activeRoute,
          GAME_CONFIG.vehicle.autopilotCruiseSpeedMps,
          GAME_CONFIG.vehicle.brakeMps2
        )
        : null;
      const targetSpeed = guidance
        ? Math.min(advice.targetSpeed, missionTargetSpeed, guidance.targetSpeedMps)
        : 0;
      this.autopilotTargetSpeedKmh = Math.max(0, targetSpeed) * 3.6;
      this.autopilotState = navigationCompleted
        ? 'waiting'
        : this.simulationSeconds < this.autopilotCollisionRecoveryUntil
          ? 'recovering'
          : insideArrivalArea
            ? 'arriving'
            : advice.reason !== 'clear' || targetSpeed + 0.8 < Math.abs(this.vehicle.speed)
              ? 'braking'
              : 'cruising';
      return {
        throttle: automaticThrottle(Math.abs(this.vehicle.speed), targetSpeed),
        steering: guidance && !insideArrivalArea ? guidance.steering : 0,
        handbrake: false,
        assistanceEnabled: true,
        assistanceHeading: guidance?.preferredRoadHeading,
        assistanceRoadAnchor: guidance?.roadAnchor
      };
    }

    this.traffic?.clearPlayerDrivingAdvice();
    this.autopilotState = 'off';
    this.autopilotTargetSpeedKmh = 0;
    return {
      throttle,
      steering: manualSteering,
      handbrake,
      assistanceEnabled: false
    };
  }

  private activeRoute() {
    return this.services?.selected ? this.serviceRoute : this.mission?.route ?? [];
  }

  private navigationTarget(): Point {
    if (this.services?.selected) return this.services.selected.stopPoint;
    if (!this.mission) return this.vehicle?.position ?? { x: 0, y: 0 };
    return this.mission.mission.phase === 'passenger-on-board'
      ? this.mission.mission.destination
      : this.mission.mission.pickup;
  }

  private navigationDistance() {
    if (!this.vehicle) return 0;
    if (this.services?.selected) return serviceAccessDistance(this.services.selected, this.vehicle.position);
    const target = this.navigationTarget();
    return Math.hypot(this.vehicle.position.x - target.x, this.vehicle.position.y - target.y);
  }

  private updateMapStreaming() {
    if (!this.mapStream || !this.vehicle || !this.traffic || !this.roadSurface || this.mapStreamLoading) return;
    const focusPosition = this.followFleetVehicle
      ? this.fleetVehicles?.activePosition() ?? this.vehicle.position
      : this.vehicle.position;
    if (!this.mapStream.needsWindow(focusPosition)) {
      if (this.map && (!this.mapRenderCenter || Math.hypot(focusPosition.x - this.mapRenderCenter.x, focusPosition.y - this.mapRenderCenter.y) > 150)) {
        this.renderMap(this.map);
        this.drawRoute();
      }
      return;
    }
    this.mapStreamLoading = true;
    const previousRegion = this.save.currentRegion;
    void this.mapStream.windowAt(focusPosition).then((map) => {
      if (!this.vehicle || !this.traffic || !this.roadSurface || !this.mapStream) return;
      this.map = map;
      this.roadSurface.replaceRoads(map.roads);
      this.traffic.updateMap(map.roads, map.signals, focusPosition);
      this.renderMap(map);
      const location = this.mapStream.location(focusPosition);
      this.save.currentChunk = location.chunkId;
      this.save.currentRegion = location.region.name;
      void this.online?.updateChunks(location.chunkId, this.adjacentChunks(location.chunkId));
      if (previousRegion !== this.save.currentRegion) this.emitToast(`Entrando em ${this.save.currentRegion}.`, 'info');
      if (this.showGraph) this.renderDebugGraph();
      this.drawRoute();
    }).catch((error) => {
      console.error(error);
      this.emitToast('O próximo trecho do mapa não pôde ser carregado. Tentando novamente.', 'warning');
    }).finally(() => {
      this.mapStreamLoading = false;
    });
  }

  private renderMap(map: CityMapData) {
    for (const visual of this.mapVisuals) visual.destroy();
    this.mapVisuals = [];
    this.signalVisuals = [];
    const renderCenter = this.followFleetVehicle
      ? this.fleetVehicles?.activePosition() ?? this.vehicle?.position ?? this.save.position
      : this.vehicle?.position ?? this.save.position;
    this.mapRenderCenter = { ...renderCenter };
    const renderRadius = this.save.settings.quality === 'high'
      ? this.save.settings.cameraZoom === 'far' ? 560 : 420
      : this.save.settings.quality === 'low'
        ? this.save.settings.cameraZoom === 'far' ? 340 : 270
        : this.save.settings.cameraZoom === 'far' ? 420 : 320;
    const visibleRoads = map.roads.filter((road) => pointsNear(road.points, renderCenter, renderRadius));
    const visibleBuildings = map.buildings.filter((building) => pointsNear(building.points, renderCenter, renderRadius));
    const visibleStops = map.busStops.filter((stop) => Math.hypot(stop.x - renderCenter.x, stop.y - renderCenter.y) <= renderRadius);
    const visibleSignals = map.signals.filter((signal) => Math.hypot(signal.x - renderCenter.x, signal.y - renderCenter.y) <= renderRadius);
    const ground = this.add.graphics().setDepth(-20);
    this.mapVisuals.push(ground);
    ground.fillStyle(0x8fb878).fillRect(-20_000, -20_000, 40_000, 40_000);
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
    this.mapVisuals.push(buildings);
    for (const building of visibleBuildings) {
      const points = building.points.map((point) => {
        const projected = this.project(point);
        return new Phaser.Math.Vector2(projected.x, projected.y);
      });
      if (points.length < 3) continue;
      if (this.save.settings.quality === 'high') {
        const height = Math.min(10, 1.4 + building.levels * 0.55);
        buildings.fillStyle(0x31485b, 0.24).fillPoints(points.map((point) => new Phaser.Math.Vector2(point.x + height, point.y + height)), true);
      }
      buildings.fillStyle(building.levels > 5 ? 0xc9d2d8 : 0xe5dfd0).fillPoints(points, true);
      if (this.save.settings.quality !== 'low') buildings.lineStyle(0.45, 0x687987, 0.65).strokePoints(points, true);
    }

    const roads = this.add.graphics().setDepth(8);
    this.mapVisuals.push(roads);
    for (const road of visibleRoads) {
      const width = visibleRoadWidth(road);
      roads.lineStyle(width + 2.2, 0xd7d3c8, 1);
      this.strokeRoad(roads, road.points);
    }
    for (const road of visibleRoads) {
      const width = visibleRoadWidth(road);
      roads.lineStyle(width, road.highway === 'service' ? 0x5d6570 : 0x454e59, 1);
      this.strokeRoad(roads, road.points);
      const renderLaneMarkings = this.save.settings.quality === 'high' || DETAILED_ROAD_MARKINGS.has(road.highway);
      if (renderLaneMarkings && road.lanes >= 2 && road.points.length > 1) {
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
    this.renderBusStops(visibleStops);
    this.renderSignals(visibleSignals);

    const attribution = this.add.text(0, 0, '© OpenStreetMap contributors', {
      fontFamily: 'Inter, sans-serif', fontSize: '10px', color: '#f8fafc', backgroundColor: '#102a43aa', padding: { x: 5, y: 3 }
    }).setScrollFactor(0).setPosition(8, this.scale.height - 92).setDepth(1000);
    this.mapVisuals.push(attribution);
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

  private renderBusStops(stops: CityMapData['busStops']) {
    const maximumStops = this.save.settings.quality === 'high' ? stops.length : this.save.settings.quality === 'low' ? 12 : 20;
    for (const [index, stop] of stops.slice(0, maximumStops).entries()) {
      const p = this.project(stop);
      const container = this.add.container(p.x, p.y).setDepth(22);
      this.mapVisuals.push(container);
      const shelter = this.add.graphics();
      shelter.fillStyle(0x102a43, 0.92).fillRect(-3.7, -4.4, 0.55, 5.4).fillRect(3.2, -4.4, 0.55, 5.4);
      shelter.fillStyle(0x1fb997, 0.9).fillRoundedRect(-4.2, -5, 8.4, 1.1, 0.3);
      shelter.fillStyle(0x8fd3e8, 0.42).fillRect(-3.1, -3.9, 6.2, 3.8);
      shelter.fillStyle(0xf7c948).fillCircle(4.8, -4.3, 1.25);
      container.add(shelter);
      const count = this.save.settings.quality === 'high' ? 1 + (index * 3) % 5 : 1 + index % 2;
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

  private renderSignals(signals: MapSignal[]) {
    for (const signal of signals) {
      const p = this.project(signal);
      const graphics = this.add.graphics().setPosition(p.x, p.y).setDepth(26);
      this.mapVisuals.push(graphics);
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
    graphics.lineStyle(0.7, 0xf8fafc, 0.9).strokeCircle(0, 0, 8.4);
    graphics.lineStyle(1.45, 0x3dd6d0, 0.95).strokeCircle(0, 0, 6.6);
    graphics.fillStyle(0x3dd6d0, 0.18).fillCircle(0, 0, 6.4);
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
    const route = this.activeRoute();
    if (route.length < 2) return;
    const serviceNavigation = Boolean(this.services?.selected);
    this.routeGraphics.lineStyle(2.25, 0x0c2e38, 0.55);
    this.strokeRoad(this.routeGraphics, route);
    this.routeGraphics.lineStyle(1.15, serviceNavigation ? 0xf2c14e : this.mission.mission.phase === 'pickup' ? 0x3fe0a6 : 0x51c9ff, 0.98);
    this.strokeRoad(this.routeGraphics, route);
    const routeColor = serviceNavigation ? 0xf2c14e : this.mission.mission.phase === 'pickup' ? 0x3fe0a6 : 0x51c9ff;
    this.drawRouteArrows(this.routeGraphics, route, routeColor);
    const target = this.navigationTarget();
    const projectedTarget = this.project(target);
    const radius = serviceNavigation
      ? GAME_CONFIG.services.interactionRadiusMeters
      : this.mission.mission.phase === 'pickup'
      ? GAME_CONFIG.mission.interactionRadiusMeters
      : GAME_CONFIG.mission.autopilotInteractionRadiusMeters;
    this.routeGraphics.lineStyle(0.45, routeColor, 0.65).strokeCircle(projectedTarget.x, projectedTarget.y, radius);
    this.routeGraphics.fillStyle(routeColor, 0.08).fillCircle(projectedTarget.x, projectedTarget.y, radius);
  }

  private drawRouteArrows(graphics: Phaser.GameObjects.Graphics, route: Point[], color: number) {
    let carried = 0;
    for (let index = 0; index < route.length - 1; index += 1) {
      const start = route[index];
      const end = route[index + 1];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length < 1) continue;
      carried += length;
      if (carried < 42) continue;
      carried = 0;
      const point = this.project({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
      const angle = this.projectedAngle(Math.atan2(end.y - start.y, end.x - start.x));
      const size = 2.2;
      graphics.fillStyle(color, 0.95).fillTriangle(
        point.x + Math.cos(angle) * size,
        point.y + Math.sin(angle) * size,
        point.x + Math.cos(angle + 2.45) * size,
        point.y + Math.sin(angle + 2.45) * size,
        point.x + Math.cos(angle - 2.45) * size,
        point.y + Math.sin(angle - 2.45) * size
      );
    }
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
      this.autopilotState = this.autopilotEnabled ? 'cruising' : 'off';
      this.autopilotStuckSeconds = 0;
      if (!this.autopilotEnabled) this.traffic?.resetPlayerRecovery();
      if (this.autopilotEnabled) {
        this.mobileInput = { throttle: 0, steering: 0, handbrake: false };
        if (this.vehicle && this.mission?.mission.phase === 'offered' && !this.services?.selected && this.mission.accept(this.vehicle.position, this.vehicle.rotation)) this.prepareAcceptedTaxiRide();
        const route = this.activeRoute();
        const guidance = this.vehicle && route.length >= 2
          ? guidanceForRoute(
            this.vehicle.position,
            this.vehicle.rotation,
            this.vehicle.speed,
            route,
            GAME_CONFIG.vehicle.autopilotCruiseSpeedMps,
            GAME_CONFIG.vehicle.brakeMps2
          )
          : null;
        if (this.vehicle?.engageAutopilot(guidance?.preferredRoadHeading) && this.mission) {
          this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
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
    if (command.type === 'set-camera-zoom') {
      this.save.settings.cameraZoom = command.zoom;
      this.cameras.main.setZoom(GAME_CONFIG.camera.zoomPresets[command.zoom]);
      if (this.map) this.renderMap(this.map);
      this.emitToast(`Distância da câmera: ${command.zoom}.`, 'info');
      return;
    }
    if (command.type === 'set-camera-shake') {
      this.save.settings.cameraShake = command.enabled;
      return;
    }
    if (command.type === 'set-traffic-density') {
      this.save.settings.trafficDensity = command.density;
      this.traffic?.setDensity(command.density);
      this.emitToast(`Densidade do trânsito: ${command.density}.`, 'info');
      return;
    }
    if (command.type === 'set-audio') {
      this.save.settings.audio = command.enabled;
      if (command.masterVolume !== undefined) this.save.settings.masterVolume = command.masterVolume;
      if (command.engineVolume !== undefined) this.save.settings.engineVolume = command.engineVolume;
      if (command.effectsVolume !== undefined) this.save.settings.effectsVolume = command.effectsVolume;
      if (command.enabled) this.audio.unlock(this.save.settings);
      return;
    }
    if (command.type === 'set-online-mode') {
      this.save.onlinePreference = command.mode;
      if (command.mode === 'solo') this.remoteVehicles?.clear();
      void this.online?.setMode(command.mode, this.save.currentChunk, this.adjacentChunks(this.save.currentChunk));
      this.emitToast(command.mode === 'online' ? 'Modo online ativado. Conectando sem interromper a partida.' : 'Modo solo ativado. Seu progresso foi preservado.', 'info');
      this.persist();
      return;
    }
    if (command.type === 'set-account-link-state') {
      this.save.accountLinkState = command.state;
      this.persist();
      this.emitHud();
      return;
    }
    if (command.type === 'set-online-visibility') {
      this.save.settings[command.setting] = command.enabled;
      this.persist();
      return;
    }
    if (command.type === 'set-online-visual-limit') {
      this.save.settings.onlineVisualLimit = Math.max(0, Math.min(50, Math.floor(command.limit)));
      this.persist();
      return;
    }
    if (command.type === 'cancel-ride' && this.mission) {
      const penalized = this.mission.cancel();
      if (penalized) new EconomyService(this.save).expense(
        GAME_CONFIG.fare.cancellationPenalty, 'fine', 'Cancelamento após embarque',
        `cancel-${this.mission.mission.id}`
      );
      this.emitToast(penalized ? 'Corrida cancelada: -R$ 3,00' : 'Corrida cancelada.', 'warning');
      this.mission.next(this.vehicle?.position ?? { x: 0, y: 0 }, this.save.completedRides + 1);
      resetTaxiMeter(this.save.taxiMeter);
      this.syncMissionVisuals();
      return;
    }
    if (command.type === 'dismiss-receipt' && this.mission && this.vehicle) {
      this.mission.next(this.vehicle.position, this.save.completedRides);
      resetTaxiMeter(this.save.taxiMeter);
      this.autopilotNextMissionAt = 0;
      this.syncMissionVisuals();
      return;
    }
    if (command.type === 'accept-ride' && this.mission && this.vehicle) {
      if (this.mission.accept(this.vehicle.position, this.vehicle.rotation)) {
        this.prepareAcceptedTaxiRide();
        this.emitToast('Corrida aceita. Siga até o embarque.', 'success');
        this.syncMissionVisuals();
      }
      return;
    }
    if (command.type === 'reject-ride' && this.mission && this.vehicle) {
      if (this.mission.reject(this.vehicle.position, this.save.completedRides)) {
        resetTaxiMeter(this.save.taxiMeter);
        this.emitToast('Oferta recusada. Nova corrida recomendada.', 'info');
        this.syncMissionVisuals();
      }
      return;
    }
    if (command.type === 'navigate-service') {
      this.navigateToService(command.serviceId);
      return;
    }
    if (command.type === 'navigate-nearest-service' && this.services && this.vehicle) {
      const location = this.services.nearestAnywhere(this.vehicle.position, command.category);
      if (!location) {
        this.emitToast('Nenhum serviço desse tipo foi encontrado no mapa.', 'warning');
        return;
      }
      this.navigateToService(location.id);
      if (!this.autopilotEnabled) this.handleCommand({ type: 'autopilot' });
      this.emitToast(`${command.category === 'fuel' ? 'Posto' : 'Oficina'} mais próximo selecionado. Piloto automático ligado.`, 'success');
      return;
    }
    if (command.type === 'clear-service-route') {
      this.resumeAfterService();
      return;
    }
    if (command.type === 'buy-fuel') {
      this.buyFuel(command.liters, command.requestId);
      return;
    }
    if (command.type === 'workshop-service') {
      this.performWorkshopService(command.service, command.requestId);
      return;
    }
    if (command.type === 'buy-upgrade') {
      this.buyUpgrade(command.upgrade, command.requestId);
      return;
    }
    if (command.type === 'pay-debt') {
      const result = new EconomyService(this.save).settleDebt(command.value, command.requestId);
      this.emitToast(result.applied ? 'Dívida reduzida e registrada no caixa.' : 'Não foi possível pagar esse valor.', result.applied ? 'success' : 'warning');
      if (result.applied) this.persist();
      return;
    }
    if (command.type === 'regularize-taxi') {
      const result = regularizeTaxi(this.save, command.requestId);
      this.emitToast(result.applied ? 'Regularização concluída. Corridas oficiais foram liberadas.' : result.reason === 'requirements' ? 'Ainda há requisitos de regularização pendentes.' : 'A regularização já foi concluída.', result.applied ? 'success' : 'warning');
      if (result.applied) { this.updateMissionVehicleContext(); this.persist(); }
      return;
    }
    if (command.type === 'convert-taxi') {
      const result = convertActiveVehicleToTaxi(this.save, command.requestId);
      const vehicle = 'vehicle' in result ? result.vehicle : undefined;
      this.emitToast(result.applied && vehicle ? `${vehicle.model} convertido em Táxi Popular sem perder seu histórico.` : result.reason === 'not-licensed' ? 'Conclua a regularização primeiro.' : 'Esse veículo já está convertido.', result.applied ? 'success' : 'warning');
      if (result.applied) { this.refreshPlayerVehicleVisual(); this.updateMissionVehicleContext(); this.persist(); }
      return;
    }
    if (command.type === 'hire-employee') {
      const result = hireEmployee(this.save, command.candidateId, command.requestId);
      const employee = 'employee' in result ? result.employee : undefined;
      this.emitToast(result.applied && employee ? `${employee.name} foi contratado para a sua frota.` : result.reason === 'not-licensed' ? 'Regularize-se antes de contratar.' : result.reason === 'capacity' ? 'A frota já atingiu o limite de motoristas.' : 'Não foi possível concluir a contratação.', result.applied ? 'success' : 'warning');
      if (result.applied) this.persist();
      return;
    }
    if (command.type === 'buy-fleet-vehicle') {
      if (!this.activeNearbyService('garage')) return;
      const result = purchaseSecondVehicle(this.save, command.requestId);
      this.emitToast(result.applied ? 'Sedan 2012 adquirido, registrado e estacionado na garagem.' : result.reason === 'capacity' ? 'A garagem já está na capacidade máxima.' : result.reason === 'not-licensed' ? 'Regularize-se antes de adquirir o Sedan.' : 'Saldo insuficiente para a compra.', result.applied ? 'success' : 'warning');
      if (result.applied) this.persist();
      return;
    }
    if (command.type === 'assign-employee') {
      const result = assignEmployee(this.save, command.employeeId, command.vehicleId);
      this.emitToast(result.applied ? 'Motorista atribuído ao veículo.' : 'O veículo está em uso ou indisponível.', result.applied ? 'success' : 'warning');
      if (result.applied) this.persist();
      return;
    }
    if (command.type === 'unassign-employee') {
      const result = unassignEmployee(this.save, command.employeeId);
      this.emitToast(result.applied ? 'Motorista removido do veículo.' : 'Encerre o turno antes de remover a atribuição.', result.applied ? 'success' : 'warning');
      if (result.applied) this.persist();
      return;
    }
    if (command.type === 'start-fleet-shift') {
      const result = startFleetShift(this.save, command.employeeId, command.requestId);
      this.emitToast(result.applied ? 'Turno iniciado. O veículo do funcionário entrou na operação.' : result.reason === 'taxi-required' ? 'O funcionário precisa de um veículo convertido em táxi.' : result.reason === 'vehicle-unfit' ? 'Abasteça ou repare o veículo antes do turno.' : 'Atribua um veículo livre ao motorista.', result.applied ? 'success' : 'warning');
      if (result.applied) { this.persist(); void this.online?.createFleetDeployment(); }
      return;
    }
    if (command.type === 'end-fleet-shift') {
      const shiftId = this.save.fleet.activeShift?.id;
      const report = endFleetShift(this.save, ['Turno encerrado pelo proprietário.']);
      this.followFleetVehicle = false;
      this.fleetVehicles?.setFollowEnabled(false);
      if (this.vehicleVisual) this.cameras.main.startFollow(this.vehicleVisual, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
      this.emitToast(report ? `Turno encerrado com lucro de ${this.formatMoney(report.netProfit)}.` : 'Não há turno ativo.', report ? 'success' : 'info');
      if (report) { this.fleetReportNotifiedId = report.id; this.persist(); if (shiftId) void this.online?.finishFleetDeployment(shiftId); }
      return;
    }
    if (command.type === 'select-vehicle') {
      if (!this.activeNearbyService('garage')) return;
      const result = selectPlayerVehicle(this.save, command.vehicleId);
      this.emitToast(result.applied && result.vehicle ? `${result.vehicle.model} agora é o veículo do jogador.` : 'Esse veículo está atribuído ou em operação.', result.applied ? 'success' : 'warning');
      if (result.applied) {
        this.rebuildPlayerVehicle();
        this.persist();
        void this.online?.setMode(this.save.onlinePreference, this.save.currentChunk, this.adjacentChunks(this.save.currentChunk));
      }
      return;
    }
    if (command.type === 'ack-fleet-report') {
      acknowledgeFleetReport(this.save);
      this.persist();
      return;
    }
    if (command.type === 'follow-fleet-vehicle') {
      this.toggleFleetFollow();
      return;
    }
    if (command.type === 'dev') this.handleDevAction(command.action);
  }

  private navigateToService(serviceId: string) {
    if (!this.services || !this.router || !this.vehicle) return;
    const location = this.services.select(serviceId);
    if (!location) return;
    const toEntrance = this.router.drivingRoute(this.vehicle.position, location.entrance, this.vehicle.rotation);
    this.serviceRoute = [...toEntrance, location.stopPoint];
    this.serviceArrived = false;
    this.drawRoute();
    this.emitToast(`Rota traçada até ${location.gameName}. O piloto pode levar você, mas não compra serviços.`, 'info');
  }

  private activeNearbyService(category: MapServiceLocation['category']) {
    if (!this.services || !this.vehicle) return null;
    const location = this.services.selectedWithin(this.vehicle.position, category)
      ?? this.services.nearest(this.vehicle.position, category);
    const speedKmh = Math.abs(this.vehicle.speed) * 3.6;
    if (!location || speedKmh > GAME_CONFIG.services.maximumInteractionSpeedKmh) {
      this.emitToast('Entre no local indicado e pare o Hatch para usar o serviço.', 'warning');
      return null;
    }
    return location;
  }

  private buyFuel(requestedLiters: number | 'full', requestId: string) {
    const location = this.activeNearbyService('fuel');
    if (!location) return;
    const capacity = GAME_CONFIG.vehicle.fuelCapacityLiters;
    const liters = requestedLiters === 'full'
      ? capacity - this.save.fuel
      : Math.min(Math.max(0, requestedLiters), capacity - this.save.fuel);
    if (liters < 0.05) { this.emitToast('O tanque já está cheio.', 'info'); return; }
    const cost = fuelPurchaseCost(liters);
    const result = new EconomyService(this.save).expense(cost, 'fuel', location.gameName, requestId, false, { liters: Math.round(liters * 100) / 100 });
    if (!result.applied) { this.emitToast(result.reason === 'duplicate' ? 'Abastecimento já registrado.' : 'Saldo insuficiente para esse abastecimento.', 'warning'); return; }
    this.save.fuel = Math.min(capacity, this.save.fuel + liters);
    this.save.visitedServices = [...new Set([...this.save.visitedServices, location.id])];
    refreshProgression(this.save);
    this.emitToast(`Abastecimento concluído: ${liters.toFixed(1)} L.`, 'success');
    this.resumeAfterService();
    this.persist();
  }

  private performWorkshopService(service: WorkshopServiceId, requestId: string) {
    const location = this.activeNearbyService('workshop');
    if (!location) return;
    const cost = workshopPrice(service, this.save.condition, this.save.maintenanceWear);
    const emergency = this.save.condition <= 0 && service !== 'diagnosis';
    const result = new EconomyService(this.save).expense(cost, 'repair', location.gameName, requestId, emergency, { service });
    if (!result.applied) { this.emitToast(result.reason === 'duplicate' ? 'Serviço já registrado.' : 'Saldo insuficiente para esse reparo.', 'warning'); return; }
    if (service === 'quick') { this.save.collisionDamage = Math.max(0, this.save.collisionDamage - 8); this.save.maintenanceWear = Math.max(0, this.save.maintenanceWear - 3); }
    if (service === 'partial') { this.save.collisionDamage = Math.max(0, this.save.collisionDamage - 22); this.save.maintenanceWear = Math.max(0, this.save.maintenanceWear - 10); }
    if (service === 'full') { this.save.collisionDamage = 0; this.save.maintenanceWear = 0; }
    if (service === 'preventive') this.save.maintenanceWear = Math.max(0, this.save.maintenanceWear - 28);
    this.save.condition = vehicleCondition(this.save.collisionDamage, this.save.maintenanceWear);
    this.save.visitedServices = [...new Set([...this.save.visitedServices, location.id])];
    refreshProgression(this.save);
    this.emitToast(service === 'diagnosis' ? `Diagnóstico: condição ${Math.round(this.save.condition)}%, desgaste ${Math.round(this.save.maintenanceWear)}%.` : 'Serviço concluído e salvo.', 'success');
    this.resumeAfterService();
    this.persist();
  }

  private buyUpgrade(upgrade: keyof PlayerSave['upgrades'], requestId: string) {
    const location = this.activeNearbyService('garage');
    if (!location || !this.vehicle) return;
    const price = upgradePrice(upgrade, this.save.upgrades);
    if (price === null) { this.emitToast('Essa melhoria já está no nível máximo.', 'info'); return; }
    const requiredLevel = ECONOMY_CONFIG.upgrades[upgrade].requirement[this.save.upgrades[upgrade]];
    if (this.save.driverLevel < requiredLevel) { this.emitToast(`Requer nível ${requiredLevel} de motorista.`, 'warning'); return; }
    const nextLevel = this.save.upgrades[upgrade] + 1;
    const result = new EconomyService(this.save).expense(price, 'upgrade', location.gameName, requestId, false, { upgrade, level: nextLevel });
    if (!result.applied) { this.emitToast(result.reason === 'duplicate' ? 'Melhoria já registrada.' : 'Saldo insuficiente para essa melhoria.', 'warning'); return; }
    this.save.upgrades[upgrade] = nextLevel;
    this.vehicle.setModifiers(upgradeEffects(this.save.upgrades));
    refreshProgression(this.save);
    this.emitToast(`${ECONOMY_CONFIG.upgrades[upgrade].name} agora está no nível ${nextLevel}.`, 'success');
    this.resumeAfterService();
    this.persist();
  }

  private resumeAfterService() {
    this.services?.clearSelection();
    this.serviceRoute = [];
    this.serviceArrived = false;
    if (this.vehicle && this.mission) {
      if (this.autopilotEnabled && this.mission.mission.phase === 'offered') this.mission.accept(this.vehicle.position, this.vehicle.rotation);
      this.mission.recalculate(this.vehicle.position, this.vehicle.rotation);
    }
    this.syncMissionVisuals();
  }

  private activeFleetVehicle() {
    return this.save.fleet.vehicles.find((vehicle) => vehicle.id === this.save.activeVehicleId);
  }

  private createPlayerVehicleVisual() {
    const vehicle = this.activeFleetVehicle();
    const sedan = vehicle?.model === 'Sedan 2012';
    return createCarVisual(this, sedan ? 0x4aa7a1 : 0xc97732, !sedan, vehicle?.taxiVisualEnabled === true).setScale(sedan ? 0.76 : 0.74);
  }

  private refreshPlayerVehicleVisual() {
    if (!this.vehicle) return;
    this.vehicleVisual?.destroy();
    this.vehicleVisual = this.createPlayerVehicleVisual();
    this.updateVisualTransform(this.vehicleVisual, this.vehicle.position, this.vehicle.rotation);
    if (!this.followFleetVehicle) this.cameras.main.startFollow(this.vehicleVisual, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
  }

  private rebuildPlayerVehicle() {
    if (!this.roadSurface) return;
    this.vehicle = new VehicleController(this.save.position, this.save.rotation, this.roadSurface);
    this.vehicle.setModifiers(upgradeEffects(this.save.upgrades));
    this.vehicle.alignToRoad(true, this.save.rotation);
    this.refreshPlayerVehicleVisual();
    this.updateMissionVehicleContext();
    this.mission?.recalculate(this.vehicle.position, this.vehicle.rotation);
    this.syncMissionVisuals();
  }

  private updateMissionVehicleContext() {
    this.mission?.updateVehicleContext({
      condition: this.save.condition,
      comfortLevel: this.save.upgrades.comfort,
      rating: this.save.rating,
      taxiLicensed: this.activeFleetVehicle()?.taxiLicensed === true,
      taxiPoints: this.map?.taxiPoints ?? [],
      regions: this.map?.manifest?.regions ?? []
    });
  }

  private prepareAcceptedTaxiRide() {
    if (!this.mission) return;
    if (this.mission.mission.rideMode !== 'official-taxi') {
      resetTaxiMeter(this.save.taxiMeter);
      return;
    }
    const demand = this.mission.mission.quote?.demandMultiplier ?? 1;
    prepareTaxiMeter(
      this.save.taxiMeter,
      this.mission.mission.id,
      this.mission.mission.destinationLabel,
      this.mission.mission.category ?? 'popular',
      demand
    );
  }

  private restoreTaxiMeterState() {
    if (!this.mission || this.mission.mission.rideMode !== 'official-taxi') {
      if (this.save.taxiMeter.state !== 'finished') resetTaxiMeter(this.save.taxiMeter);
      return;
    }
    if (this.save.taxiMeter.tripId !== this.mission.mission.id) this.prepareAcceptedTaxiRide();
    if (this.mission.mission.phase === 'passenger-on-board' && ['en-route', 'boarding'].includes(this.save.taxiMeter.state)) {
      markTaxiBoarding(this.save.taxiMeter);
      startTaxiMeter(this.save.taxiMeter, this.save.taxiMeter.startedAt ?? undefined);
    }
  }

  private toggleFleetFollow() {
    if (!this.vehicle || !this.fleetVehicles || !this.save.fleet.activeShift) {
      this.emitToast('Inicie um turno para acompanhar o veículo do funcionário.', 'warning');
      return;
    }
    this.followFleetVehicle = !this.followFleetVehicle;
    this.fleetVehicles.setFollowEnabled(this.followFleetVehicle);
    if (this.followFleetVehicle) {
      this.fleetVehicles.update(this.save, this.vehicle.position, 0.01);
      const target = this.fleetVehicles.followedObject();
      if (target) this.cameras.main.startFollow(target, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
      this.emitToast('Câmera acompanhando o veículo da frota. O controle continua sendo do funcionário.', 'info');
    } else if (this.vehicleVisual) {
      this.cameras.main.startFollow(this.vehicleVisual, true, GAME_CONFIG.camera.followLerp, GAME_CONFIG.camera.followLerp);
      this.emitToast('Câmera voltou ao veículo do jogador.', 'info');
    }
  }

  private formatMoney(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private handleDevAction(action: string) {
    if (action === 'online-latency') {
      this.debugOnlineLatencyMs = this.debugOnlineLatencyMs === 0 ? 120 : this.debugOnlineLatencyMs === 120 ? 300 : 0;
      this.online?.setDebugNetwork(this.debugOnlineLatencyMs, this.debugOnlineLossRate);
      this.emitToast(`Latência online simulada: ${this.debugOnlineLatencyMs} ms.`, 'info');
      return;
    }
    if (action === 'online-loss') {
      this.debugOnlineLossRate = this.debugOnlineLossRate === 0 ? 0.1 : this.debugOnlineLossRate === 0.1 ? 0.3 : 0;
      this.online?.setDebugNetwork(this.debugOnlineLatencyMs, this.debugOnlineLossRate);
      this.emitToast(`Perda online simulada: ${Math.round(this.debugOnlineLossRate * 100)}%.`, 'info');
      return;
    }
    if (action === 'online-disconnect') { void this.online?.forceReconnect(); return; }
    if (action === 'online-fake' && this.vehicle) { this.remoteVehicles?.injectFake(this.vehicle.position); return; }
    if (action === 'online-clear') { this.remoteVehicles?.clear(); return; }
    if (!import.meta.env.DEV || !this.vehicle || !this.mission || !this.traffic) return;
    if (action === 'money-add') new EconomyService(this.save).income(1_000, 'dev', 'Painel dev', `dev-money-add-${Date.now()}`);
    if (action === 'money-remove') new EconomyService(this.save).expense(100, 'dev', 'Painel dev', `dev-money-remove-${Date.now()}`);
    if (action === 'fuel-zero') this.save.fuel = 0;
    if (action === 'refuel') this.save.fuel = GAME_CONFIG.vehicle.fuelCapacityLiters;
    if (action === 'damage') this.save.collisionDamage = Math.min(100, this.save.collisionDamage + 25);
    if (action === 'wear') this.save.maintenanceWear = Math.min(100, this.save.maintenanceWear + 25);
    if (action === 'repair') { this.save.collisionDamage = 0; this.save.maintenanceWear = 0; }
    this.save.condition = vehicleCondition(this.save.collisionDamage, this.save.maintenanceWear);
    if (action === 'teleport-pickup') {
      if (this.mission.mission.phase === 'offered') this.mission.accept(this.vehicle.position, this.vehicle.rotation);
      this.vehicle.teleport(this.mission.mission.pickup);
    }
    if (action === 'teleport-destination') this.vehicle.teleport(this.mission.mission.destination);
    if (action === 'service-entry' && this.services?.selected) {
      this.vehicle.teleport(this.services.selected.entrance);
      this.serviceRoute = [this.services.selected.entrance, this.services.selected.stopPoint];
      this.serviceArrived = false;
    }
    if (action === 'complete') {
      if (this.mission.mission.phase === 'offered') this.mission.accept(this.vehicle.position, this.vehicle.rotation);
      if (this.mission.mission.phase === 'pickup') this.vehicle.teleport(this.mission.mission.pickup);
      else this.vehicle.teleport(this.mission.mission.destination);
    }
    if (action === 'generate') {
      this.mission.next(this.vehicle.position, this.save.completedRides + 1);
      this.syncMissionVisuals();
    }
    if (action === 'offer-urgent') {
      this.mission.next(this.vehicle.position, this.save.completedRides + 1);
      this.mission.mission.category = 'urgent';
      this.syncMissionVisuals();
    }
    if (action === 'rating') this.save.rating = 5;
    if (action === 'xp') this.save.xp += 500;
    if (action === 'goals') Object.keys(this.save.goals).forEach((goal) => { this.save.goals[goal as keyof typeof this.save.goals] = true; });
    if (action === 'regularization') {
      this.save.completedRides = 20; this.save.xp = 1_000; this.save.rating = 4.8; this.save.totalKm = 30;
      new EconomyService(this.save).income(1_000, 'dev', 'Regularização dev', `dev-regularization-${Date.now()}`);
      refreshProgression(this.save);
    }
    if (action === 'debt') new EconomyService(this.save).expense(250, 'emergency', 'Dívida dev', `dev-debt-${Date.now()}`, true);
    if (action === 'regularize-now') regularizeTaxi(this.save, `dev-regularize-${Date.now()}`);
    if (action === 'remove-regularization') {
      this.save.professionalStatus = 'clandestine';
      this.save.taxiLicense = { ...this.save.taxiLicense, status: 'eligible', requestedAt: null, issuedAt: null };
      const active = this.activeFleetVehicle();
      if (active) { active.taxiLicensed = false; active.taxiVisualEnabled = false; active.taxiRegistrationId = null; }
      resetTaxiMeter(this.save.taxiMeter);
      this.refreshPlayerVehicleVisual();
    }
    if (action === 'convert-taxi') {
      convertActiveVehicleToTaxi(this.save, `dev-convert-${Date.now()}`);
      this.refreshPlayerVehicleVisual();
    }
    if (action === 'taxi-offer') {
      this.updateMissionVehicleContext();
      this.mission.nextOfficial(this.vehicle.position, this.save.completedRides + 1);
      this.syncMissionVisuals();
    }
    if (action === 'meter-start') {
      if (this.mission.mission.phase === 'offered') this.mission.accept(this.vehicle.position, this.vehicle.rotation);
      this.prepareAcceptedTaxiRide(); markTaxiBoarding(this.save.taxiMeter); startTaxiMeter(this.save.taxiMeter);
    }
    if (action === 'meter-finish') finishTaxiMeter(this.save.taxiMeter);
    if (action === 'hire-bia') hireEmployee(this.save, 'bia-rocha', `dev-hire-bia-${Date.now()}`);
    if (action === 'hire-leo') hireEmployee(this.save, 'leo-martins', `dev-hire-leo-${Date.now()}`);
    if (action === 'hire-nara') hireEmployee(this.save, 'nara-souza', `dev-hire-nara-${Date.now()}`);
    if (action === 'dismiss-employee' && this.save.fleet.employees[0]) dismissEmployee(this.save, this.save.fleet.employees[0].id);
    if (action === 'buy-sedan') {
      if (this.save.money < GAME_CONFIG.fleet.secondVehiclePrice) new EconomyService(this.save).income(GAME_CONFIG.fleet.secondVehiclePrice, 'dev', 'Compra de teste', `dev-sedan-money-${Date.now()}`);
      purchaseSecondVehicle(this.save, `dev-sedan-${Date.now()}`);
    }
    if (action === 'assign-first') {
      const employee = this.save.fleet.employees[0];
      const fleetVehicle = this.save.fleet.vehicles.find((candidate) => candidate.id !== this.save.activeVehicleId);
      if (employee && fleetVehicle) assignEmployee(this.save, employee.id, fleetVehicle.id);
    }
    if (action === 'start-shift' && this.save.fleet.employees[0]) startFleetShift(this.save, this.save.fleet.employees[0].id, `dev-shift-${Date.now()}`);
    if (action === 'end-shift') endFleetShift(this.save, ['Turno encerrado pelo painel de desenvolvimento.']);
    if (action === 'fleet-hour') advanceFleetShift(this.save, 3_600, true);
    if (action === 'fleet-eight-hours') {
      if (this.save.fleet.activeShift) this.save.fleet.activeShift.scheduledEndAt = new Date(Date.parse(this.save.fleet.activeShift.lastSimulatedAt) + 8 * 3_600_000).toISOString();
      advanceFleetShift(this.save, 8 * 3_600, true);
    }
    if (action === 'follow-fleet') this.toggleFleetFollow();
    if (action === 'force-fuel') {
      const assigned = this.save.fleet.vehicles.find((candidate) => candidate.id === this.save.fleet.activeShift?.vehicleId || candidate.controllerType === 'EMPLOYEE');
      if (assigned) { assigned.fuel = 0.1; assigned.state = 'out-of-fuel'; }
    }
    if (action === 'force-maintenance') {
      const assigned = this.save.fleet.vehicles.find((candidate) => candidate.id === this.save.fleet.activeShift?.vehicleId || candidate.controllerType === 'EMPLOYEE');
      if (assigned) { assigned.condition = 30; assigned.maintenanceWear = 100; assigned.state = 'maintenance'; }
    }
    if (action === 'upgrade-all') {
      Object.keys(this.save.upgrades).forEach((id) => { this.save.upgrades[id as keyof typeof this.save.upgrades] = 3; });
      this.vehicle.setModifiers(upgradeEffects(this.save.upgrades));
    }
    if (action.startsWith('simulate-')) {
      const rides = Number(action.split('-')[1]);
      const result = simulateEconomy('average', rides);
      this.emitToast(`Simulação ${rides}: saldo ${result.balance.toFixed(2)}, lucro ${result.profit.toFixed(2)}.`, 'info');
    }
    if (action === 'traffic') this.traffic.enabled = !this.traffic.enabled;
    if (action === 'signals') this.traffic.signalsEnabled = !this.traffic.signalsEnabled;
    if (action === 'signal-phase') this.emitToast(`Fase dos sinais: ${this.traffic.cycleSignalOverride()}.`, 'info');
    if (action === 'traffic-ahead') this.traffic.debugPlaceVehicle(this.vehicle.position, this.vehicle.rotation, 16);
    if (action === 'traffic-jam') this.traffic.debugPlaceTrafficJam(this.vehicle.position, this.vehicle.rotation);
    if (action === 'traffic-collision') this.traffic.debugPlaceVehicle(this.vehicle.position, this.vehicle.rotation, 0);
    if (action === 'collision-light') {
      this.vehicle.speed = 3;
      this.traffic.debugPlaceCollision(this.vehicle.position, this.vehicle.rotation);
    }
    if (action === 'collision-moderate') {
      this.vehicle.speed = 10;
      this.traffic.debugPlaceCollision(this.vehicle.position, this.vehicle.rotation);
    }
    if (action === 'collision-severe') {
      this.vehicle.speed = 18;
      this.traffic.debugPlaceCollision(this.vehicle.position, this.vehicle.rotation);
    }
    if (action === 'traffic-head-on') this.traffic.debugPlaceHeadOnVehicle(this.vehicle.position, this.vehicle.rotation);
    if (action === 'taxi') this.emitToast('Táxi desbloqueado temporariamente para testes.', 'success');
    if (action === 'time') this.traffic.timeScale = this.traffic.timeScale === 1 ? 2 : this.traffic.timeScale === 2 ? 0.5 : 1;
    if (action === 'graph') {
      this.showGraph = !this.showGraph;
      this.renderDebugGraph();
    }
    if (action === 'colliders') this.emitToast('Colisores de pista: limite claro das vias.', 'info');
    if (action === 'reset') localStorage.clear();
    refreshProgression(this.save);
    this.updateMissionVehicleContext();
    if (action !== 'reset') this.persist();
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
    refreshProgression(this.save);
    const phase = this.mission.mission.phase;
    const target = this.navigationTarget();
    const desiredAngle = Math.atan2(target.y - this.vehicle.position.y, target.x - this.vehicle.position.x);
    const distanceRemaining = this.services?.selected
      ? routeDistanceFrom(this.serviceRoute, this.vehicle.position, target)
      : this.mission.remainingDistance(this.vehicle.position);
    const trafficStats = this.traffic?.stats() ?? {
      total: 0, capacity: 0, hardCeiling: GAME_CONFIG.traffic.maximumTerrestrialEntities, reservedSlots: 0,
      buses: 0, utility: 0, stunned: 0, ghosted: 0, deadlockRecoveries: 0, brakeReason: 'clear' as const, stopReason: 'Livre'
    };
    const selectedService = this.services?.selected ?? null;
    const selectedServiceDistance = selectedService
      ? serviceAccessDistance(selectedService, this.vehicle.position)
      : Number.POSITIVE_INFINITY;
    const nearbyService = selectedService && selectedServiceDistance <= GAME_CONFIG.services.interactionRadiusMeters
      ? selectedService
      : this.services?.nearest(this.vehicle.position) ?? null;
    const fleetTelemetry = this.fleetVehicles?.routeTelemetry() ?? {
      target: null, remaining: 0, routeRemaining: 0, completedStops: 0,
      recoveries: 0, lastRecoveryReason: null, identification: null
    };
    const remoteTelemetry = this.remoteVehicles?.telemetry() ?? {
      nearbyPlayers: 0, remoteEmployees: 0, interpolationBuffer: 0, extrapolating: 0,
      lostPackets: 0, outOfOrderPackets: 0, npcReplacements: 0
    };
    const onlineTelemetry = this.online?.telemetry(remoteTelemetry) ?? {
      mode: this.save.onlinePreference,
      state: this.save.onlinePreference === 'solo' ? 'SOLO' as const : 'OFFLINE' as const,
      accountLinkState: this.save.accountLinkState,
      publicSessionId: null, nearbyPlayers: 0, remoteEmployees: 0, offlineDeployments: 0,
      pingMs: null, quality: 'offline' as const, subscribedTopics: [], sendRateHz: 0, receiveRateHz: 0,
      sequence: 0, interpolationBuffer: 0, extrapolating: 0, lostPackets: 0, outOfOrderPackets: 0,
      npcReplacements: 0, reconnectAttempts: 0, warning: null
    };
    if (this.simulationSeconds >= this.collisionFeedbackUntil) {
      this.collisionSeverity = null;
      this.collisionRelativeSpeedKmh = 0;
    }
    const snapshot: HudSnapshot = {
      ready: this.initialized,
      settings: { ...this.save.settings },
      money: this.save.money,
      speedKmh: Math.abs(this.vehicle.speed) * 3.6,
      fuel: this.save.fuel,
      fuelCapacity: GAME_CONFIG.vehicle.fuelCapacityLiters,
      condition: this.save.condition,
      objective: this.services?.selected
        ? `${this.serviceArrived ? 'Parado em' : 'Siga para'} ${this.services.selected.gameName}`
        : phase === 'offered'
          ? `Nova oferta de ${this.mission.mission.passengerName}`
        : phase === 'pickup'
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
      collisionSeverity: this.collisionSeverity,
      collisionRelativeSpeedKmh: this.collisionRelativeSpeedKmh,
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
      autopilotState: this.autopilotState,
      autopilotTargetSpeedKmh: this.autopilotTargetSpeedKmh,
      trafficStopReason: trafficStats.stopReason,
      repositionProgress: this.repositionProgress,
      routeRecalculations: this.routeRecalculations,
      mission: this.mission.mission,
      receipt: this.mission.receipt,
      ledger: this.save.ledger,
      debts: this.save.debts,
      upgrades: { ...this.save.upgrades },
      maintenanceWear: this.save.maintenanceWear,
      collisionDamage: this.save.collisionDamage,
      totalKm: this.save.totalKm,
      totalEarned: this.save.totalEarned,
      totalSpent: this.save.totalSpent,
      tipsEarned: this.save.tipsEarned,
      driverLevel: this.save.driverLevel,
      rating: this.save.rating,
      completedRides: this.save.completedRides,
      goals: { ...this.save.goals },
      regularizationReady: this.save.regularizationReady,
      nearbyService,
      selectedService: this.services?.selected ?? null,
      airTraffic: this.airTraffic?.count() ?? 0,
      trafficCapacity: trafficStats.capacity,
      trafficHardCeiling: trafficStats.hardCeiling,
      trafficReservedSlots: trafficStats.reservedSlots,
      serviceLocations: this.services?.locations ?? [],
      taxiPoints: this.map?.taxiPoints ?? [],
      professionalStatus: this.save.professionalStatus,
      taxiLicense: { ...this.save.taxiLicense },
      taxiMeter: { ...this.save.taxiMeter },
      officialTaxiRides: this.save.officialTaxiRides,
      activeVehicleId: this.save.activeVehicleId,
      fleet: structuredClone(this.save.fleet),
      fleetVehicleVisible: this.fleetVehicles?.isVisible() ?? false,
      fleetRouteTarget: fleetTelemetry.target,
      fleetRouteRemaining: fleetTelemetry.remaining,
      fleetRoutePathRemaining: fleetTelemetry.routeRemaining,
      fleetCompletedStops: fleetTelemetry.completedStops,
      fleetRouteRecoveries: fleetTelemetry.recoveries,
      fleetLastRecoveryReason: fleetTelemetry.lastRecoveryReason,
      fleetDriverIdentification: fleetTelemetry.identification,
      totalTerrestrialEntities: Math.min(trafficStats.hardCeiling, trafficStats.total + 1 + (this.fleetVehicles?.isVisible() ? 1 : 0) + (this.remoteVehicles?.count() ?? 0)),
      mapVersion: this.save.mapVersion,
      currentRegion: this.save.currentRegion,
      currentChunk: this.save.currentChunk,
      loadedMapChunks: this.map?.loadedChunkIds?.length ?? 0,
      mapRegions: this.map?.manifest?.regions.map((region) => region.name) ?? [],
      online: onlineTelemetry
    };
    gameEvents.emit('hud', snapshot);
  }

  private emitToast(message: string, tone: 'info' | 'success' | 'warning') {
    gameEvents.emit('toast', { message, tone });
  }

  private showCollisionFeedback(severity: CollisionSeverity | null, relativeSpeedKmh: number) {
    if (!severity || severity === 'contact' || !this.vehicle) return;
    const intensity = GAME_CONFIG.traffic.collision.cameraShake[severity];
    if (this.save.settings.cameraShake && intensity > 0) this.cameras.main.shake(150, intensity);
    const vibration = GAME_CONFIG.traffic.collision.vibrationMs[severity];
    if (vibration > 0 && typeof navigator.vibrate === 'function') navigator.vibrate(vibration);
    const center = this.project(this.vehicle.position);
    const color = severity === 'light' ? 0xffd166 : severity === 'moderate' ? 0xff914d : 0xff4d4d;
    for (let index = 0; index < 5; index += 1) {
      const spark = this.add.graphics().setPosition(center.x, center.y).setDepth(1_100);
      spark.fillStyle(color, 0.95).fillCircle(0, 0, 0.7 + relativeSpeedKmh / 90);
      const angle = this.vehicle.rotation + Math.PI + (index - 2) * 0.42;
      this.tweens.add({
        targets: spark,
        x: center.x + Math.cos(angle) * (7 + index * 1.5),
        y: center.y + Math.sin(angle) * (7 + index * 1.5),
        alpha: 0,
        duration: 260,
        onComplete: () => spark.destroy()
      });
    }
  }

  private persist() {
    if (!this.vehicle) return;
    this.save.position = { ...this.vehicle.position };
    this.save.localPosition = { ...this.vehicle.position };
    this.save.geographicPosition = localMetersToLatLon(
      this.vehicle.position.x,
      this.vehicle.position.y,
      this.map?.metadata.origin ?? { lat: -15.7942, lon: -47.8822 }
    );
    if (this.vehicle.roadEdgeClearance() > 0) this.save.lastSafePosition = { ...this.vehicle.position };
    if (this.mapStream) {
      const location = this.mapStream.location(this.vehicle.position);
      this.save.currentChunk = location.chunkId;
      this.save.currentRegion = location.region.name;
    }
    const nearestLaneNode = this.router?.nearest(this.vehicle.position);
    this.save.laneId = nearestLaneNode?.laneId ?? null;
    this.save.roadSegmentId = nearestLaneNode?.roadSegmentId ?? null;
    this.save.mapVersion = GAME_CONFIG.mapVersion;
    this.save.lastOnlineChunk = this.save.currentChunk;
    this.save.fleetPublicProfile.publicVehicleCount = this.save.fleet.vehicles.length;
    this.save.fleetPublicProfile.name = this.save.fleet.name;
    this.save.fleetPublicProfile.status = this.online?.telemetry().state === 'ONLINE' ? 'active' : 'offline';
    this.save.rotation = this.vehicle.rotation;
    this.save.activeMission = this.mission?.snapshot() ?? null;
    this.save.autopilotEnabled = this.autopilotEnabled;
    syncActiveVehicleFromLegacy(this.save);
    this.save = writeSave(this.save);
    gameEvents.emit('save', this.save);
  }

  private pickLine(lines: readonly string[]) {
    return lines[this.save.completedRides % lines.length];
  }

  private adjacentChunks(chunkId: string) {
    return this.map?.manifest?.chunks.find((chunk) => chunk.id === chunkId)?.adjacent ?? [];
  }

  private publishOnlineMovement() {
    if (!this.online || !this.vehicle) return;
    const now = Date.now();
    const elapsed = Math.max(0.016, (now - this.lastOnlineUpdateAt) / 1_000);
    const acceleration = this.lastOnlineUpdateAt ? (this.vehicle.speed - this.lastOnlineSpeed) / elapsed : 0;
    const active = this.activeFleetVehicle();
    const movement: LocalMovementState = {
      vehicleId: active?.id ?? this.save.activeVehicleId,
      controllerType: 'PLAYER',
      vehicleModel: active?.model ?? 'Hatch 1998',
      position: { ...this.vehicle.position },
      heading: this.vehicle.rotation,
      speed: this.vehicle.speed,
      acceleration,
      occupied: this.mission?.mission.phase === 'passenger-on-board',
      autopilot: this.autopilotEnabled,
      braking: acceleration < -1.5 || Math.abs(this.vehicle.speed) < 0.2,
      colorId: active?.taxiVisualEnabled ? 'taxi' : active?.model === 'Sedan 2012' ? 'blue' : 'amber'
    };
    this.online.updateVehicle(movement, now);
    const employee = this.fleetVehicles?.publicMovementState(this.save);
    this.online.updateEmployee(employee ? {
      ...employee, controllerType: 'EMPLOYEE', autopilot: true,
      colorId: employee.vehicleModel === 'Sedan 2012' ? 'green' : 'amber'
    } : null, now);
    this.lastOnlineSpeed = this.vehicle.speed;
    this.lastOnlineUpdateAt = now;
  }
}

function pointsNear(points: Point[], center: Point, radius: number) {
  if (!points.length) return false;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const nearestX = Math.max(minX, Math.min(center.x, maxX));
  const nearestY = Math.max(minY, Math.min(center.y, maxY));
  return Math.hypot(nearestX - center.x, nearestY - center.y) <= radius;
}

function collisionMessage(severity: CollisionSeverity | null, relativeSpeedKmh: number) {
  const speed = Math.round(relativeSpeedKmh);
  if (severity === 'contact') return 'Apenas um contato, sem dano ao Hatch.';
  if (severity === 'light') return `Batida leve a ${speed} km/h relativos.`;
  if (severity === 'moderate') return `Colisão moderada a ${speed} km/h relativos: dirija com cuidado.`;
  return `Colisão severa a ${speed} km/h relativos: o Hatch sofreu danos.`;
}

function vehicleCondition(collisionDamage: number, maintenanceWear: number) {
  return Math.max(0, Math.min(100, 100 - collisionDamage - maintenanceWear * 0.45));
}

function routeDistanceFrom(route: Point[], position: Point, target: Point) {
  if (!route.length) return Math.hypot(position.x - target.x, position.y - target.y);
  let distance = Math.hypot(position.x - route[0].x, position.y - route[0].y);
  for (let index = 0; index < route.length - 1; index += 1) {
    distance += Math.hypot(route[index + 1].x - route[index].x, route[index + 1].y - route[index].y);
  }
  return distance;
}
