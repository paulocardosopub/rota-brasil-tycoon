import { GAME_CONFIG } from '../../config/gameConfig';
import { GraphRouter } from '../../map/routing/GraphRouter';
import type { GraphNode, MissionSnapshot, Point, Receipt, RideCategory, RideQuality, TaxiPoint } from '../../types/game';
import { createFareQuote, settleFare } from '../economy/FareCalculator';
import { advanceActiveRoute } from '../systems/RouteProgress';

type MissionVehicleContext = {
  condition: number;
  comfortLevel: number;
  rating: number;
  taxiLicensed?: boolean;
  taxiPoints?: TaxiPoint[];
};

export class MissionSystem {
  mission: MissionSnapshot;
  route: Point[] = [];
  receipt: Receipt | null = null;
  private candidateNodes: GraphNode[] = [];
  private rejectedOffers = 0;

  constructor(
    private readonly router: GraphRouter,
    start: Point,
    completedRides: number,
    savedMission?: MissionSnapshot | null,
    private vehicleContext: MissionVehicleContext = { condition: 70, comfortLevel: 0, rating: 5 }
  ) {
    this.candidateNodes = this.pickReachableCandidates(start);
    this.mission = savedMission && (savedMission.phase === 'offered' || savedMission.phase === 'pickup' || savedMission.phase === 'passenger-on-board')
      ? this.ensureEconomyFields(structuredClone(savedMission), completedRides, start)
      : this.createMission(start, completedRides);
    if (savedMission && savedMission.phase !== 'offered') this.recalculate(start);
  }

  private pickReachableCandidates(start: Point) {
    const all = this.router.candidates(80);
    const stride = Math.max(1, Math.floor(all.length / 120));
    return all.filter((_, index) => index % stride === 0).flatMap((node) => {
      const route = this.router.route(start, node);
      const distance = this.router.distance(route);
      return route.length > 2 && distance > 80 && distance < 1_500 ? [{ node, distance }] : [];
    }).sort((a, b) => a.distance - b.distance).slice(0, 64).map(({ node }) => node);
  }

  private createMission(start: Point, rideIndex: number, forceOfficial = false): MissionSnapshot {
    const pool = this.candidateNodes.length >= 8 ? this.candidateNodes : this.router.candidates(40);
    const nearbyCount = Math.max(1, Math.min(16, pool.length));
    const taxiPoints = this.vehicleContext.taxiPoints ?? [];
    const official = Boolean(this.vehicleContext.taxiLicensed && taxiPoints.length && (forceOfficial || rideIndex % 3 !== 0));
    const requestTypes = ['taxi-rank', 'street-hail', 'dispatch'] as const;
    const taxiRequestType = requestTypes[rideIndex % requestTypes.length];
    const taxiPoint = official && taxiRequestType === 'taxi-rank' ? taxiPoints[rideIndex % taxiPoints.length] : undefined;
    const pickup: Point = taxiPoint?.entrance ?? pool[(rideIndex * 7) % nearbyCount] ?? this.router.nearest(start);
    let destination = pool[(rideIndex * 11 + Math.floor(pool.length / 2)) % pool.length];
    for (let offset = 1; offset < pool.length; offset += 1) {
      const candidate = pool[(rideIndex * 11 + Math.floor(pool.length / 2) + offset) % pool.length];
      const testRoute = this.router.route(pickup, candidate);
      const distance = this.router.distance(testRoute);
      if (testRoute.length > 2 && distance > 180 && distance < 1_700) {
        destination = candidate;
        break;
      }
    }
    destination ??= this.router.nearest({ x: -pickup.x * 0.55, y: -pickup.y * 0.55 });
    const pickupRoute = this.router.drivingRoute(start, pickup);
    const rideRoute = this.router.drivingRoute(pickup, destination);
    const rideDistance = this.router.distance(rideRoute);
    const category = categoryForRide(rideIndex);
    const labels = GAME_CONFIG.mission.locationLabels;
    return {
      id: `ride-${Date.now()}-${rideIndex}`,
      passengerName: GAME_CONFIG.mission.passengerNames[rideIndex % GAME_CONFIG.mission.passengerNames.length],
      phase: 'offered',
      pickup: { x: pickup.x, y: pickup.y },
      destination: { x: destination.x, y: destination.y },
      pickupLabel: taxiPoint?.gameName ?? labels[(rideIndex * 2) % labels.length],
      destinationLabel: labels[(rideIndex * 2 + 5) % labels.length],
      distanceTravelled: 0,
      elapsedSeconds: 0,
      category,
      region: 'Plano Piloto — região central',
      deadlineSeconds: category === 'urgent' ? Math.max(150, Math.round(rideDistance / 8.5 + 80)) : Math.max(240, Math.round(rideDistance / 7 + 150)),
      offerExpiresAt: new Date(Date.now() + 45_000).toISOString(),
      pickupDistanceKm: this.router.distance(pickupRoute) / 1_000,
      requirements: category === 'comfort' ? ['Conforto nível 1 recomendado'] : ['Hatch disponível'],
      quote: createFareQuote({
        distanceMeters: rideDistance,
        estimatedSeconds: Math.max(90, rideDistance / 7.5 + 75),
        category,
        demand: 0.97 + (rideIndex % 5) * 0.035,
        difficulty: 1 + Math.min(0.09, pickupRoute.length / 900),
        condition: this.vehicleContext.condition,
        comfortLevel: this.vehicleContext.comfortLevel,
        rating: this.vehicleContext.rating
      }),
      quality: freshQuality(),
      rideMode: official ? 'official-taxi' : 'informal',
      taxiRequestType: official ? taxiRequestType : undefined,
      taxiPointId: taxiPoint?.id
    };
  }

  update(
    position: Point,
    speedKmh: number,
    deltaSeconds: number,
    travelled: number,
    rating: number,
    interactionRadiusMeters: number = GAME_CONFIG.mission.interactionRadiusMeters,
    maxInteractionSpeedKmh: number = GAME_CONFIG.mission.maxInteractionSpeedKmh
  ) {
    if (this.mission.phase === 'offered') return null;
    if (this.mission.phase === 'passenger-on-board') {
      this.mission.elapsedSeconds += deltaSeconds;
      this.mission.distanceTravelled += travelled;
    }
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    const distance = Math.hypot(position.x - target.x, position.y - target.y);
    const stoppedCorrectly = distance <= interactionRadiusMeters && speedKmh <= maxInteractionSpeedKmh;
    if (this.mission.phase === 'pickup' && stoppedCorrectly) {
      this.mission.phase = 'passenger-on-board';
      this.route = this.router.drivingRoute(position, this.mission.destination);
      return 'picked-up' as const;
    }
    if (this.mission.phase === 'passenger-on-board' && stoppedCorrectly) {
      this.mission.phase = 'completed';
      const context = this.vehicleContext ?? { condition: 70, comfortLevel: 0, rating: 5 };
      const quote = this.mission.quote ?? createFareQuote({
        distanceMeters: this.mission.distanceTravelled,
        estimatedSeconds: this.mission.elapsedSeconds,
        category: this.mission.category ?? 'popular', demand: 1, difficulty: 1,
        condition: context.condition, comfortLevel: context.comfortLevel, rating
      });
      this.receipt = settleFare(quote, this.mission.quality ?? freshQuality(), this.mission.distanceTravelled, this.mission.elapsedSeconds, context.condition);
      this.route = [];
      return 'completed' as const;
    }
    return null;
  }

  recalculate(position: Point) {
    if (this.mission.phase === 'offered' || this.mission.phase === 'completed' || this.mission.phase === 'cancelled') return;
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    this.route = this.router.drivingRoute(position, target);
  }

  advanceRoute(position: Point) {
    const progress = advanceActiveRoute(this.route, position);
    this.route = progress.route;
    return progress.deviationMeters;
  }

  cancel() {
    const afterPickup = this.mission.phase === 'passenger-on-board';
    this.mission.phase = 'cancelled';
    this.route = [];
    return afterPickup;
  }

  next(position: Point, completedRides: number) {
    this.receipt = null;
    this.mission = this.createMission(position, completedRides);
  }

  nextOfficial(position: Point, completedRides: number) {
    this.receipt = null;
    this.mission = this.createMission(position, completedRides, true);
  }

  updateVehicleContext(context: Partial<MissionVehicleContext>) {
    this.vehicleContext = { ...this.vehicleContext, ...context };
  }

  accept(position: Point) {
    if (this.mission.phase !== 'offered') return false;
    this.mission.phase = 'pickup';
    this.mission.quality = freshQuality();
    this.route = this.router.drivingRoute(position, this.mission.pickup);
    return this.route.length >= 2;
  }

  reject(position: Point, completedRides: number) {
    if (this.mission.phase !== 'offered') return false;
    this.rejectedOffers += 1;
    this.mission = this.createMission(position, completedRides + this.rejectedOffers);
    return true;
  }

  recordCollision() {
    if (this.mission.phase === 'passenger-on-board' && this.mission.quality) this.mission.quality.collisions += 1;
  }

  recordRedLight() {
    if (this.mission.phase === 'passenger-on-board' && this.mission.quality) this.mission.quality.redLights += 1;
  }

  recordDrivingQuality(deltaSeconds: number, deviating: boolean, aggressive: boolean) {
    if (this.mission.phase !== 'passenger-on-board' || !this.mission.quality) return;
    if (deviating) this.mission.quality.deviationSeconds += deltaSeconds;
    if (aggressive) this.mission.quality.aggressiveSeconds += deltaSeconds;
  }

  remainingDistance(position: Point) {
    if (this.mission.phase === 'offered') {
      return (this.mission.pickupDistanceKm ?? Math.hypot(position.x - this.mission.pickup.x, position.y - this.mission.pickup.y) / 1_000) * 1_000;
    }
    if (!this.route.length) return 0;
    return Math.hypot(position.x - this.route[0].x, position.y - this.route[0].y) + this.router.distance(this.route);
  }

  targetDistance(position: Point) {
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    return Math.hypot(position.x - target.x, position.y - target.y);
  }

  snapshot() {
    return this.mission.phase === 'offered' || this.mission.phase === 'pickup' || this.mission.phase === 'passenger-on-board'
      ? structuredClone(this.mission)
      : null;
  }

  private ensureEconomyFields(mission: MissionSnapshot, rideIndex: number, currentPosition: Point) {
    mission.category ??= categoryForRide(rideIndex);
    mission.rideMode ??= 'informal';
    mission.region ??= 'Plano Piloto — região central';
    mission.quality ??= freshQuality();
    mission.deadlineSeconds ??= 360;
    mission.pickupDistanceKm ??= this.router.distance(this.router.drivingRoute(currentPosition, mission.pickup)) / 1_000;
    mission.requirements ??= mission.category === 'comfort' ? ['Conforto nível 1 recomendado'] : ['Hatch disponível'];
    if (!mission.quote) {
      const route = this.router.drivingRoute(mission.pickup, mission.destination);
      const distance = this.router.distance(route);
      mission.quote = createFareQuote({
        distanceMeters: distance, estimatedSeconds: Math.max(90, distance / 7.5 + 75), category: mission.category,
        demand: 1, difficulty: 1, condition: this.vehicleContext.condition,
        comfortLevel: this.vehicleContext.comfortLevel, rating: this.vehicleContext.rating
      });
    }
    return mission;
  }

}

function categoryForRide(index: number): RideCategory {
  return (['popular', 'urgent', 'popular', 'comfort'] as RideCategory[])[index % 4];
}

function freshQuality(): RideQuality {
  return { collisions: 0, redLights: 0, deviationSeconds: 0, aggressiveSeconds: 0, startedAt: new Date().toISOString() };
}
