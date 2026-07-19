import { GAME_CONFIG } from '../../config/gameConfig';
import { GraphRouter } from '../../map/routing/GraphRouter';
import type { GraphNode, MapRegion, MissionSnapshot, Point, Receipt, RideCategory, RideQuality, TaxiPoint, WorkKind } from '../../types/game';
import { createFareQuote, settleFare } from '../economy/FareCalculator';
import { ECONOMY_CONFIG } from '../economy/EconomyConfig';
import { advanceActiveRoute } from '../systems/RouteProgress';
import { familiarityLevel, regionAt } from '../../map/regions/RegionCatalog';
import type { MapServiceLocation, RegionalFamiliarity, RegionPreference } from '../../types/game';

type MissionVehicleContext = {
  condition: number;
  comfortLevel: number;
  rating: number;
  taxiLicensed?: boolean;
  taxiPoints?: TaxiPoint[];
  regions?: MapRegion[];
  preferredRegionId?: RegionPreference;
  regionalFamiliarity?: Record<string, RegionalFamiliarity>;
  services?: MapServiceLocation[];
  fuelLiters?: number;
};

export class MissionSystem {
  mission: MissionSnapshot;
  route: Point[] = [];
  receipt: Receipt | null = null;
  private candidateNodes: GraphNode[] = [];
  private rejectedOffers = 0;

  constructor(
    private router: GraphRouter,
    start: Point,
    completedRides: number,
    savedMission?: MissionSnapshot | null,
    private vehicleContext: MissionVehicleContext = { condition: 70, comfortLevel: 0, rating: 5 }
  ) {
    this.candidateNodes = this.pickReachableCandidates(start);
    this.mission = savedMission && (savedMission.phase === 'offered' || savedMission.phase === 'pickup' || savedMission.phase === 'passenger-on-board')
      ? this.ensureEconomyFields(structuredClone(savedMission), completedRides, start)
      : this.createMission(start, completedRides);
  }

  private pickReachableCandidates(start: Point) {
    const connected = this.router.supportsRegionalRoutes()
      ? this.router.distributedCandidates(900, 80)
      : this.router.reachableCandidates(start, 80);
    const all = connected.length >= 8 ? connected : this.router.candidates(80);
    const regions = this.vehicleContext.regions?.filter((region) => region.playable) ?? [];
    if (!regions.length) {
      const distributed = all.filter((_, index) => index % Math.max(1, Math.floor(all.length / 240)) === 0);
      return evenlyDistributed(distributed, 160);
    }
    const byRegion = new Map(regions.map((region) => [region.id, [] as GraphNode[]]));
    for (const node of all) byRegion.get(regionAt(node, regions).id)?.push(node);
    const regional = regions.flatMap((region) => evenlyDistributed(byRegion.get(region.id) ?? [], 42));
    const local = all
      .filter((node) => Math.hypot(node.x - start.x, node.y - start.y) > 100 && Math.hypot(node.x - start.x, node.y - start.y) < 2_000)
      .slice(0, 48);
    return [...new Map([...regional, ...local].map((node) => [node.id, node])).values()];
  }

  private createMission(start: Point, rideIndex: number): MissionSnapshot {
    const pool = this.candidateNodes.length >= 8 ? this.candidateNodes : this.router.candidates(40);
    const regions = this.vehicleContext.regions?.filter((region) => region.playable) ?? [];
    const currentRegion = regions.length ? regionAt(start, regions) : null;
    const regionalPlan = this.router.supportsRegionalRoutes()
      ? chooseRegionalPlan(
        regions,
        currentRegion,
        this.vehicleContext.preferredRegionId ?? 'any',
        rideIndex,
        pool
      )
      : currentRegion
        ? { pickupRegion: currentRegion, destinationRegion: currentRegion, kind: 'within-region' as const }
        : { pickupRegion: null, destinationRegion: null, kind: 'between-sectors' as const };
    const taxiPoints = this.vehicleContext.taxiPoints ?? [];
    const official = isOfficialTaxiRide(this.vehicleContext.taxiLicensed === true, taxiPoints.length);
    const requestTypes = ['taxi-rank', 'street-hail', 'dispatch'] as const;
    const taxiRequestType = requestTypes[rideIndex % requestTypes.length];
    const taxiPoint = official && taxiRequestType === 'taxi-rank' ? taxiPoints[rideIndex % taxiPoints.length] : undefined;
    const pickupPool = regionalPlan.pickupRegion
      ? pool.filter((node) => regionAt(node, regions).id === regionalPlan.pickupRegion!.id)
      : pool;
    const pickupCandidates = taxiPoint ? [taxiPoint.entrance, ...pickupPool] : pickupPool;
    const viablePickups = pickupCandidates.filter((candidate) => {
      const estimated = estimatedDrivingDistance(start, candidate);
      return estimated >= 500 && estimated <= 2_000;
    });
    const taxiPickupDistance = taxiPoint ? estimatedDrivingDistance(start, taxiPoint.entrance) : Number.POSITIVE_INFINITY;
    const pickup: Point = taxiPoint && taxiPickupDistance >= 350 && taxiPickupDistance <= 2_500
      ? taxiPoint.entrance
      : viablePickups[(rideIndex * 7) % Math.max(1, viablePickups.length)]
        ?? pickupCandidates[(rideIndex * 7) % Math.max(1, pickupCandidates.length)]
        ?? pool[(rideIndex * 7) % Math.max(1, pool.length)]
        ?? this.router.nearest(start);
    const pickupDistance = estimatedDrivingDistance(start, pickup);
    const bands = [
      { id: 'short', min: 300, max: 1_500 },
      { id: 'medium', min: 1_500, max: 3_500 },
      { id: 'long', min: 3_500, max: 7_500 },
      { id: 'inter-region', min: 2_500, max: 18_000 }
    ] as const;
    const band = regionalPlan.kind === 'long' ? bands[3] : bands[rideIndex % 3];
    const destinationPool = pool.filter((candidate) => {
      if (regionalPlan.destinationRegion && regionAt(candidate, regions).id !== regionalPlan.destinationRegion.id) return false;
      const estimated = estimatedDrivingDistance(pickup, candidate);
      return estimated >= band.min && estimated <= band.max * 1.1;
    });
    const destination: Point = destinationPool[(rideIndex * 11) % Math.max(1, destinationPool.length)]
      ?? pool.find((candidate) => estimatedDrivingDistance(pickup, candidate) >= band.min * 0.7)
      ?? pool[Math.floor(pool.length / 2)]
      ?? this.router.nearest({ x: -pickup.x * 0.55, y: -pickup.y * 0.55 });
    const rideDistance = Math.max(band.min, Math.min(band.max * 1.1, estimatedDrivingDistance(pickup, destination)));
    const category = categoryForRide(rideIndex);
    const pickupRegion = regions.length ? regionAt(pickup, regions) : null;
    const destinationRegion = regions.length ? regionAt(destination, regions) : null;
    const familiarity = pickupRegion ? this.vehicleContext.regionalFamiliarity?.[pickupRegion.id] : undefined;
    const familiarityClass = familiarityLevel(familiarity?.completedRides ?? 0, familiarity?.kilometers ?? 0);
    const familiarityBonus = familiarityClass === 'favorite'
      ? ECONOMY_CONFIG.regional.favoriteEfficiencyBonus
      : familiarityClass === 'known' ? ECONOMY_CONFIG.regional.knownEfficiencyBonus : 0;
    const demand = demandMultiplier(pickupRegion?.demandLevel, rideIndex) * (1 + familiarityBonus);
    const recommendedFuelLiters = Math.ceil((pickupDistance + rideDistance) / 8.8 * 1.15 / 100) / 10;
    const usesTaxiPoint = taxiPoint && Math.hypot(pickup.x - taxiPoint.entrance.x, pickup.y - taxiPoint.entrance.y) < 2;
    return {
      id: `ride-${Date.now()}-${rideIndex}`,
      passengerName: GAME_CONFIG.mission.passengerNames[rideIndex % GAME_CONFIG.mission.passengerNames.length],
      phase: 'offered',
      pickup: { x: pickup.x, y: pickup.y },
      destination: { x: destination.x, y: destination.y },
      pickupLabel: usesTaxiPoint ? taxiPoint.gameName : `Embarque • ${this.addressAt(pickup, pickupRegion?.name ?? 'Brasília')}`,
      destinationLabel: `Destino • ${this.addressAt(destination, destinationRegion?.name ?? 'Brasília')}`,
      distanceTravelled: 0,
      elapsedSeconds: 0,
      category,
      distanceBand: band.id,
      region: pickupRegion && destinationRegion ? `${pickupRegion.name} → ${destinationRegion.name}` : 'Brasília ampliada',
      deadlineSeconds: category === 'urgent' ? Math.max(150, Math.round(rideDistance / 8.5 + 80)) : Math.max(240, Math.round(rideDistance / 7 + 150)),
      offerExpiresAt: new Date(Date.now() + 45_000).toISOString(),
      pickupDistanceKm: pickupDistance / 1_000,
      requirements: category === 'comfort' ? ['Conforto nível 1 recomendado'] : ['Hatch disponível'],
      quote: createFareQuote({
        distanceMeters: rideDistance,
        estimatedSeconds: Math.max(90, rideDistance / 7.5 + 75),
        category,
        demand,
        difficulty: 1 + Math.min(0.09, pickupDistance / 20_000),
        condition: this.vehicleContext.condition,
        comfortLevel: this.vehicleContext.comfortLevel,
        rating: this.vehicleContext.rating
      }),
      quality: freshQuality(),
      rideMode: official ? 'official-taxi' : 'informal',
      taxiRequestType: official ? taxiRequestType : undefined,
      taxiPointId: usesTaxiPoint ? taxiPoint.id : undefined,
      pickupRegionId: pickupRegion?.id,
      destinationRegionId: destinationRegion?.id,
      regionalCategory: regionalCategory(regionalPlan.kind, category, official),
      demandLevel: pickupRegion?.demandLevel ?? 'medium',
      familiarityLevel: familiarityClass,
      recommendedFuelLiters,
      routeDistanceMeters: rideDistance
    };
  }

  update(
    position: Point,
    speedKmh: number,
    deltaSeconds: number,
    travelled: number,
    rating: number,
    interactionRadiusMeters: number = GAME_CONFIG.mission.interactionRadiusMeters,
    maxInteractionSpeedKmh: number = GAME_CONFIG.mission.maxInteractionSpeedKmh,
    heading?: number
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
      this.route = [];
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

  recalculate(position: Point, heading?: number) {
    if (this.mission.phase === 'offered' || this.mission.phase === 'completed' || this.mission.phase === 'cancelled') return;
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    this.route = this.router.drivingRoute(position, target, heading);
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
    this.route = [];
    this.mission = this.createMission(position, completedRides);
  }

  nextOfficial(position: Point, completedRides: number) {
    this.receipt = null;
    this.route = [];
    this.mission = this.createMission(position, completedRides);
  }

  nextWork(position: Point, completedRides: number, business: 'delivery' | 'light-freight') {
    this.receipt = null;
    this.route = [];
    this.mission = this.createMission(position, completedRides);
    const kinds: WorkKind[] = business === 'delivery'
      ? ['document', 'food', 'small-parcel', 'express', 'multi-stop']
      : ['urban-freight', 'large-parcel', 'small-move', 'supply', 'inter-region-freight'];
    const cargoWeightKg = business === 'delivery' ? 2 + completedRides % 24 : 120 + completedRides % 780;
    this.mission.workKind = kinds[completedRides % kinds.length];
    this.mission.cargoWeightKg = cargoWeightKg;
    this.mission.cargoVolumeM3 = business === 'delivery' ? 0.03 + (completedRides % 8) * 0.015 : 0.8 + (completedRides % 14) * 0.32;
    this.mission.fragile = completedRides % 4 === 0;
    this.mission.requiredVehicle = business === 'delivery' ? 'Moto Urbana 125' : 'Furgão Compacto';
    this.mission.passengerName = business === 'delivery' ? 'Cliente da Central de Entregas' : 'Cliente Frete Brasília';
    this.mission.pickupLabel = `Coleta • ${this.mission.pickupLabel.replace(/^Embarque\s*•?\s*/, '')}`;
    this.mission.destinationLabel = `Entrega • ${this.mission.destinationLabel.replace(/^Destino\s*•?\s*/, '')}`;
    this.mission.requirements = [`${cargoWeightKg} kg`, this.mission.fragile ? 'Carga frágil' : 'Carga comum', business === 'delivery' ? 'Veículo de entrega' : 'Furgão ou van'];
  }

  updateVehicleContext(context: Partial<MissionVehicleContext>) {
    this.vehicleContext = { ...this.vehicleContext, ...context };
  }

  accept(_position: Point, _heading?: number) {
    if (this.mission.phase !== 'offered') return false;
    this.mission.phase = 'pickup';
    this.mission.quality = freshQuality();
    this.route = [];
    return true;
  }

  reject(position: Point, completedRides: number) {
    if (this.mission.phase !== 'offered') return false;
    this.rejectedOffers += 1;
    this.route = [];
    this.mission = this.createMission(position, completedRides + this.rejectedOffers);
    return true;
  }

  setRoute(route: Point[]) {
    this.route = route.map((point) => ({ ...point }));
  }

  updateRouter(router: GraphRouter, position?: Point) {
    this.router = router;
    if (position) this.candidateNodes = this.pickReachableCandidates(position);
  }

  /** Replaces a target created from a provisional local graph when the global
   * graph cannot reach it. This keeps the accepted mission instead of leaving
   * the autopilot stopped with an empty route. */
  recoverTargetRoute(position: Point, heading?: number) {
    if (this.mission.phase !== 'pickup' && this.mission.phase !== 'passenger-on-board') return [];
    const pickup = this.mission.phase === 'pickup';
    const minimum = pickup ? 300 : distanceBand(this.mission.distanceBand).min;
    const maximum = pickup ? 2_000 : distanceBand(this.mission.distanceBand).max * 1.25;
    const candidates = this.router.reachableCandidates(position, 160);
    for (const candidate of candidates) {
      const direct = Math.hypot(candidate.x - position.x, candidate.y - position.y);
      if (direct < minimum * 0.55 || direct > maximum) continue;
      const route = this.router.drivingRoute(position, candidate, heading);
      const routedDistance = this.router.distance(route);
      if (route.length < 2 || routedDistance < minimum || routedDistance > maximum) continue;
      const regions = this.vehicleContext.regions?.filter((region) => region.playable) ?? [];
      const region = regions.length ? regionAt(candidate, regions) : null;
      if (pickup) {
        this.mission.pickup = { x: candidate.x, y: candidate.y };
        this.mission.pickupLabel = `Embarque • ${this.addressAt(candidate, region?.name ?? 'Brasília')}`;
        this.mission.pickupDistanceKm = routedDistance / 1_000;
        this.mission.pickupRegionId = region?.id;
        this.mission.taxiPointId = undefined;
      } else {
        this.mission.destination = { x: candidate.x, y: candidate.y };
        this.mission.destinationLabel = `Destino • ${this.addressAt(candidate, region?.name ?? 'Brasília')}`;
        this.mission.destinationRegionId = region?.id;
        this.mission.routeDistanceMeters = routedDistance;
      }
      return route;
    }
    return [];
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
    mission.pickupDistanceKm ??= estimatedDrivingDistance(currentPosition, mission.pickup) / 1_000;
    mission.requirements ??= mission.category === 'comfort' ? ['Conforto nível 1 recomendado'] : ['Hatch disponível'];
    const regions = this.vehicleContext.regions?.filter((region) => region.playable) ?? [];
    if (!mission.taxiPointId && !mission.pickupLabel.includes('Brasília, DF')) {
      const pickupRegion = regions.length ? regionAt(mission.pickup, regions) : null;
      mission.pickupLabel = `${mission.workKind ? 'Coleta' : 'Embarque'} • ${this.addressAt(mission.pickup, pickupRegion?.name ?? 'Brasília')}`;
    }
    if (!mission.destinationLabel.includes('Brasília, DF')) {
      const destinationRegion = regions.length ? regionAt(mission.destination, regions) : null;
      mission.destinationLabel = `${mission.workKind ? 'Entrega' : 'Destino'} • ${this.addressAt(mission.destination, destinationRegion?.name ?? 'Brasília')}`;
    }
    if (!mission.quote) {
      const distance = estimatedDrivingDistance(mission.pickup, mission.destination);
      mission.routeDistanceMeters = distance;
      mission.quote = createFareQuote({
        distanceMeters: distance, estimatedSeconds: Math.max(90, distance / 7.5 + 75), category: mission.category,
        demand: 1, difficulty: 1, condition: this.vehicleContext.condition,
        comfortLevel: this.vehicleContext.comfortLevel, rating: this.vehicleContext.rating
      });
    }
    return mission;
  }

  private addressAt(point: Point, regionName: string) {
    return typeof this.router.addressAt === 'function'
      ? this.router.addressAt(point, regionName)
      : `${regionName}, Brasília, DF`;
  }

}

export function isOfficialTaxiRide(taxiLicensed: boolean, taxiPointCount: number) {
  return taxiLicensed && taxiPointCount > 0;
}

function categoryForRide(index: number): RideCategory {
  return (['popular', 'urgent', 'popular', 'comfort'] as RideCategory[])[index % 4];
}

function distanceBand(id: MissionSnapshot['distanceBand']) {
  if (id === 'medium') return { min: 1_500, max: 3_500 };
  if (id === 'long') return { min: 3_500, max: 7_500 };
  if (id === 'inter-region') return { min: 2_500, max: 18_000 };
  return { min: 300, max: 1_500 };
}

function freshQuality(): RideQuality {
  return { collisions: 0, redLights: 0, deviationSeconds: 0, aggressiveSeconds: 0, startedAt: new Date().toISOString() };
}

function evenlyDistributed(nodes: GraphNode[], maximum: number) {
  const count = Math.min(maximum, nodes.length);
  if (!count) return [];
  return Array.from({ length: count }, (_, index) => nodes[Math.floor(index * nodes.length / count)]);
}

function estimatedDrivingDistance(from: Point, to: Point) {
  // The offer only needs an estimate. The exact directed route is calculated
  // once after acceptance instead of dozens of times on the rendering thread.
  return Math.hypot(to.x - from.x, to.y - from.y) * 1.18;
}

function chooseRegionalPlan(regions: MapRegion[], current: MapRegion | null, preferredId: RegionPreference, rideIndex: number, candidates: GraphNode[]) {
  const withCandidates = regions.filter((region) => candidates.some((node) => regionAt(node, regions).id === region.id));
  const preferred = (preferredId !== 'any' ? withCandidates.find((region) => region.id === preferredId) : null) ?? current ?? withCandidates[0] ?? null;
  const roll = Math.abs(rideIndex * 37) % 100;
  if (!preferred) return { pickupRegion: null, destinationRegion: null, kind: 'between-sectors' as const };
  if (roll < ECONOMY_CONFIG.regional.preferredShare * 100) return { pickupRegion: preferred, destinationRegion: preferred, kind: 'within-region' as const };
  const neighbors = withCandidates.filter((region) => preferred.neighbors.includes(region.id));
  if (roll < (ECONOMY_CONFIG.regional.preferredShare + ECONOMY_CONFIG.regional.neighborShare) * 100 && neighbors.length) {
    const neighbor = neighbors[rideIndex % neighbors.length];
    return { pickupRegion: neighbor, destinationRegion: preferred, kind: 'neighbor-region' as const };
  }

  const distant = [...withCandidates].sort((a, b) => Math.hypot(b.center.x - preferred.center.x, b.center.y - preferred.center.y)
    - Math.hypot(a.center.x - preferred.center.x, a.center.y - preferred.center.y))[rideIndex % Math.max(1, withCandidates.length)] ?? preferred;
  return { pickupRegion: preferred, destinationRegion: distant, kind: 'long' as const };
}

function demandMultiplier(level: MapRegion['demandLevel'] | undefined, rideIndex: number) {
  const base = level === 'high' ? 1.06 : level === 'low' ? 0.96 : 1;
  return base + (rideIndex % 3) * 0.015;
}

function regionalCategory(plan: 'within-region' | 'neighbor-region' | 'between-sectors' | 'long', category: RideCategory, official: boolean): NonNullable<MissionSnapshot['regionalCategory']> {
  if (official) return 'taxi';
  if (category === 'urgent') return 'urgent';
  if (category === 'comfort') return 'comfort';
  return plan;
}
