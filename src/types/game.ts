export type MissionPhase = 'offered' | 'pickup' | 'passenger-on-board' | 'completed' | 'cancelled';
export type RideCategory = 'popular' | 'urgent' | 'comfort';
export type TransactionKind = 'income' | 'expense' | 'debt' | 'adjustment';
export type TransactionCategory =
  | 'ride' | 'tip' | 'fuel' | 'repair' | 'upgrade' | 'fine' | 'reposition' | 'emergency' | 'dev'
  | 'license' | 'commission' | 'fleet-purchase' | 'fleet-revenue' | 'fleet-maintenance';
export type VehicleUpgradeId = 'engine' | 'brakes' | 'tires' | 'suspension' | 'economy' | 'comfort';
export type ServiceCategory = 'fuel' | 'workshop' | 'garage';
export type RegionPreference = 'any' | string;
export type RegionDemandLevel = 'low' | 'medium' | 'high';
export type RegionFamiliarityLevel = 'new' | 'known' | 'favorite';
export type ProfessionalStatus = 'clandestine' | 'licensed-taxi';
export type RideMode = 'informal' | 'official-taxi';
export type TaxiRequestType = 'taxi-rank' | 'street-hail' | 'dispatch';
export type TaxiMeterState = 'free' | 'en-route' | 'boarding' | 'occupied' | 'waiting' | 'finished';
export type FleetControllerType = 'PLAYER' | 'EMPLOYEE' | 'AMBIENT_NPC' | 'FUTURE_REMOTE_PLAYER' | 'FUTURE_REMOTE_EMPLOYEE';
export type VehicleModel = 'Hatch 1998' | 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020'
  | 'Moto Urbana 125' | 'Moto Cargo 160' | 'Scooter Express 150' | 'Triciclo Cargo 200' | 'Hatch Entrega'
  | 'Furgão Compacto' | 'Van de Carga' | 'Picape Leve' | 'Furgão Médio' | 'Utilitário Baú';
export type EmployeeQualification = 'CAR' | 'TAXI' | 'MOTORCYCLE' | 'DELIVERY_VAN' | 'LIGHT_FREIGHT';
export type BusinessKind = 'taxi' | 'delivery' | 'light-freight';
export type WorkKind = 'passenger' | 'document' | 'food' | 'small-parcel' | 'express' | 'multi-stop' | 'urban-freight' | 'large-parcel' | 'small-move' | 'supply' | 'inter-region-freight';
export type FleetSimulationLevel = 'detailed' | 'simplified' | 'economic';
export type FleetVehicleState = 'available' | 'player-driving' | 'employee-driving' | 'on-trip' | 'returning' | 'refueling' | 'maintenance' | 'out-of-fuel' | 'damaged' | 'parked';
export type EmployeeState = 'available' | 'waiting-vehicle' | 'starting-shift' | 'seeking-trip' | 'en-route' | 'with-passenger' | 'returning' | 'refueling' | 'break' | 'blocked' | 'ending-shift' | 'resting';
export type OnlineModePreference = 'online' | 'solo';
export type OnlineConnectionState = 'ONLINE' | 'INSTABLE' | 'RECONNECTING' | 'SOLO_TEMPORARY' | 'OFFLINE' | 'SOLO';
export type AccountLinkState = 'local' | 'anonymous' | 'pending-email' | 'permanent';
export type PublicAvatarId = 'driver-amber' | 'driver-blue' | 'driver-green' | 'driver-violet';

export interface FleetPublicProfile {
  fleetPublicId: string;
  name: string;
  tag: string;
  color: string;
  emblemId: 'road-star' | 'capital-wheel' | 'cerrado-route';
  publicVehicleCount: number;
  status: 'active' | 'offline';
}

export interface Point {
  x: number;
  y: number;
}

export interface RoadPoint extends Point {
  lat: number;
  lon: number;
  nodeId: string;
}

export interface RoadData {
  id: string;
  name: string;
  highway: string;
  oneway: boolean;
  lanes: number;
  width: number;
  points: RoadPoint[];
  osmWayId?: string;
  corridorId?: string;
  ref?: string;
  lanesForward?: number;
  lanesBackward?: number;
  speedLimitKmh?: number;
  layer?: number;
  bridge?: boolean;
  tunnel?: boolean;
  surface?: string;
  access?: string;
  junction?: string;
  chunkIds?: string[];
}

export interface GraphEdge {
  to: string;
  distance: number;
  roadId: string;
  laneId?: string;
  highway?: string;
  connector?: boolean;
}

export interface GraphNode extends Point {
  id: string;
  edges: GraphEdge[];
  laneId?: string;
  roadSegmentId?: string;
  chunkId?: string;
  sourceNodeId?: string;
}

export interface NavigationGraph {
  nodes: GraphNode[];
  kind?: 'road' | 'lane';
  version?: string;
}

export interface LaneData {
  id: string;
  roadSegmentId: string;
  corridorId: string;
  direction: 'forward' | 'backward';
  index: number;
  width: number;
  speedLimitKmh: number;
  points: Array<Point & { sourceNodeId: string }>;
  startNodeId: string;
  endNodeId: string;
  nextLaneIds: string[];
  neighborLaneIds: string[];
  movements: Array<'straight' | 'left' | 'right'>;
  layer: number;
  chunkIds: string[];
}

export interface MapChunkManifestEntry {
  id: string;
  regionId: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  adjacent: string[];
  file: string;
  roadCount: number;
  buildingCount: number;
  laneCount: number;
  capacity: number;
  spawnBudget: number;
  playerBudget: number;
  fleetBudget: number;
  npcBudget: number;
}

export interface MapRegion {
  id: string;
  name: string;
  center: Point;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  polygon: Point[];
  neighbors: string[];
  color: string;
  predominantType: 'central' | 'residential' | 'mixed' | 'commercial' | 'airport' | 'university';
  demandLevel: RegionDemandLevel;
  servicesAvailable: ServiceCategory[];
  chunkIds: string[];
  playable: boolean;
  priority: number;
  source: { name: string; url: string; objectId: string; note?: string };
}

export interface RegionalFamiliarity {
  regionId: string;
  completedRides: number;
  kilometers: number;
  pickupIds: string[];
  destinationIds: string[];
  corridorIds: Record<string, number>;
  workSeconds: number;
  ratingTotal: number;
  ratingCount: number;
  recurringClients: number;
}

export interface CityMapManifest {
  mapVersion: string;
  city: string;
  origin: { lat: number; lon: number };
  bbox: { south: number; west: number; north: number; east: number };
  chunkSizeMeters: number;
  graphFile: string;
  signalFile: string;
  serviceBase: string;
  regions: MapRegion[];
  chunks: MapChunkManifestEntry[];
}

export interface CityMapChunk {
  id: string;
  regionId: string;
  roads: RoadData[];
  lanes: LaneData[];
  signals: MapSignal[];
  busStops: BusStop[];
  buildings: MapBuilding[];
}

export interface MapBuilding {
  id: string;
  levels: number;
  points: Point[];
}

export interface MapSignal extends Point {
  id: string;
  nodeId: string;
  direction?: number;
}

export interface BusStop extends Point {
  id: string;
  name: string;
}

export interface MapMetadata {
  city: string;
  area: string;
  origin: { lat: number; lon: number };
  bbox: { south: number; west: number; north: number; east: number };
  importedAt: string;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  coordinateSystem: string;
}

export interface CityMapData {
  metadata: MapMetadata;
  roads: RoadData[];
  graph: NavigationGraph;
  signals: MapSignal[];
  busStops: BusStop[];
  buildings: MapBuilding[];
  services: MapServiceLocation[];
  taxiPoints: TaxiPoint[];
  manifest?: CityMapManifest;
  lanes?: LaneData[];
  loadedChunkIds?: string[];
}

export interface TaxiPoint {
  id: string;
  official: boolean;
  realName: string;
  gameName: string;
  lat: number;
  lon: number;
  point: Point & { lat: number; lon: number };
  entrance: Point & { lat: number; lon: number; graphNodeId: string };
  exit: Point & { lat: number; lon: number; graphNodeId: string };
  sourceType: 'node' | 'gameplay-zone';
  sourceId: string;
  sourceUrl: string;
  accessRoad: string;
  sideOfRoad: string;
  queueArea: string;
  capacity: number | null;
  gameplayCapacity: number;
  validatedAt: string;
  confidence: 'high' | 'medium';
}

export interface MapServiceLocation {
  id: string;
  category: ServiceCategory;
  realName: string;
  gameName: string;
  lat: number;
  lon: number;
  sourceType: 'node' | 'way' | 'adapted-building';
  sourceId: string;
  buildingId: string;
  address: string;
  entrance: Point & { lat: number; lon: number; graphNodeId: string };
  stopPoint: Point & { lat: number; lon: number };
  accessRoad: string;
  sideOfRoad: string;
  confidence: 'high' | 'medium';
  functionFictional: boolean;
  regionId?: string;
  sourceUrl?: string;
  functionNote?: string;
}

export interface FareQuote {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  demandMultiplier: number;
  categoryMultiplier: number;
  difficultyMultiplier: number;
  conditionMultiplier: number;
  comfortBonus: number;
  ratingBonus: number;
  urgencyBonus: number;
  guaranteedTotal: number;
  estimatedDistanceKm: number;
  estimatedMinutes: number;
}

export interface RideQuality {
  collisions: number;
  redLights: number;
  deviationSeconds: number;
  aggressiveSeconds: number;
  startedAt: string;
}

export interface MissionSnapshot {
  id: string;
  passengerName: string;
  phase: MissionPhase;
  pickup: Point;
  destination: Point;
  pickupLabel: string;
  destinationLabel: string;
  distanceTravelled: number;
  elapsedSeconds: number;
  category?: RideCategory;
  region?: string;
  deadlineSeconds?: number;
  offerExpiresAt?: string;
  pickupDistanceKm?: number;
  requirements?: string[];
  quote?: FareQuote;
  quality?: RideQuality;
  rideMode?: RideMode;
  taxiRequestType?: TaxiRequestType;
  taxiPointId?: string;
  distanceBand?: 'short' | 'medium' | 'long' | 'inter-region';
  pickupRegionId?: string;
  destinationRegionId?: string;
  regionalCategory?: 'within-region' | 'neighbor-region' | 'between-sectors' | 'long' | 'return' | 'comfort' | 'urgent' | 'taxi';
  demandLevel?: RegionDemandLevel;
  familiarityLevel?: RegionFamiliarityLevel;
  recommendedFuelLiters?: number;
  routeDistanceMeters?: number;
  workKind?: WorkKind;
  cargoWeightKg?: number;
  cargoVolumeM3?: number;
  fragile?: boolean;
  requiredVehicle?: VehicleModel;
}

export interface Receipt {
  distanceKm: number;
  timeMinutes: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  ratingBonus: number;
  total: number;
  xp: number;
  rating: number;
  guaranteedTotal?: number;
  qualityBonus?: number;
  penalties?: number;
  tip?: number;
  positives?: string[];
  penaltyReasons?: string[];
}

export interface LedgerTransaction {
  id: string;
  kind: TransactionKind;
  category: TransactionCategory;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  rideId?: string;
  origin: string;
  metadata: Record<string, string | number | boolean>;
  idempotencyKey: string;
  vehicleId?: string;
  driverId?: string;
  fleetId?: string;
  tripId?: string;
  ownerId?: string;
}

export interface TaxiLicense {
  status: 'not-eligible' | 'eligible' | 'licensed';
  requestedAt: string | null;
  issuedAt: string | null;
  costPaid: number;
  idempotencyKey: string | null;
  gameplayDisclaimer: string;
}

export interface TaxiMeterSnapshot {
  state: TaxiMeterState;
  tripId: string | null;
  currentFare: number;
  distanceMeters: number;
  elapsedSeconds: number;
  waitingSeconds: number;
  demandMultiplier: number;
  category: RideCategory;
  destinationLabel: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface FleetVehicle {
  id: string;
  ownerId: string;
  fleetId: string;
  model: VehicleModel;
  controllerType: FleetControllerType;
  controllerId: string | null;
  authority: 'local' | 'server';
  state: FleetVehicleState;
  simulationLevel: FleetSimulationLevel;
  currentRegion: string;
  currentChunk: string;
  stateVersion: number;
  updatedAt: string;
  leaseExpiresAt: string | null;
  taxiLicensed: boolean;
  taxiVisualEnabled: boolean;
  taxiRegistrationId: string | null;
  fuel: number;
  fuelCapacity: number;
  condition: number;
  collisionDamage: number;
  maintenanceWear: number;
  totalKm: number;
  upgrades: UpgradeLevels;
  position: Point;
  rotation: number;
  purchasePrice: number;
  acquiredAt: string;
  grossRevenue: number;
  expenses: number;
  nextMaintenanceKm: number;
  baseGarageId: string;
  cargoCapacityKg: number;
  cargoVolumeM3: number;
}

export interface EmployeeCandidate {
  id: string;
  name: string;
  avatar: string;
  experience: number;
  driving: number;
  safety: number;
  service: number;
  efficiency: number;
  commissionPercent: number;
  hireCost: number;
  description: string;
  qualifications: EmployeeQualification[];
}

export interface FleetEmployee extends EmployeeCandidate {
  fleetId: string;
  ownerId: string;
  state: EmployeeState;
  vehicleId: string | null;
  hiredAt: string;
  grossRevenue: number;
  commissionPaid: number;
  tripsCompleted: number;
  regionalPreferences: EmployeeRegionalPreferences;
  baseGarageId: string;
}

export interface OwnedGarage {
  serviceId: string;
  regionId: string;
  name: string;
  acquiredAt: string;
  purchasePrice: number;
  operatingCost: number;
  vehicleCapacity: number;
  employeeCapacity: number;
}

export interface EmployeeRegionalPreferences {
  preferredRegionId: RegionPreference;
  allowedRegionIds: string[];
  maximumDistanceKm: number;
  acceptLongTrips: boolean;
  returnToPreferredRegion: boolean;
  returnToGarage: boolean;
  preferredFuelServiceId: string | null;
  preferredWorkshopServiceId: string | null;
  minimumCondition: number;
  minimumFuelPercent: number;
}

export interface ShiftPolicy {
  minimumFuelPercent: number;
  automaticRepairLimit: number;
  minimumCondition: number;
  categories: RideCategory[];
  durationMinutes: number;
  returnToGarage: boolean;
  pauseOnLoss: boolean;
  regional: EmployeeRegionalPreferences;
}

export interface FleetShift {
  id: string;
  fleetId: string;
  ownerId: string;
  employeeId: string;
  vehicleId: string;
  state: EmployeeState;
  simulationLevel: FleetSimulationLevel;
  startedAt: string;
  lastSimulatedAt: string;
  scheduledEndAt: string;
  tripId: string | null;
  routeProgress: number;
  policy: ShiftPolicy;
  rides: number;
  kilometers: number;
  grossRevenue: number;
  fuelCost: number;
  commission: number;
  maintenanceCost: number;
  fines: number;
  netProfit: number;
}

export interface FleetReport {
  id: string;
  shiftId: string;
  elapsedMinutes: number;
  unvalidatedClock: boolean;
  rides: number;
  kilometers: number;
  grossRevenue: number;
  fuelCost: number;
  commission: number;
  repairs: number;
  fines: number;
  netProfit: number;
  finalState: EmployeeState;
  occurrences: string[];
  createdAt: string;
  acknowledged: boolean;
}

export interface PlayerFleet {
  id: string;
  ownerId: string;
  name: string;
  garageServiceId: string;
  capacity: number;
  vehicles: FleetVehicle[];
  employees: FleetEmployee[];
  activeShift: FleetShift | null;
  lastReport: FleetReport | null;
  garages: OwnedGarage[];
}

export interface PlayerBusiness {
  kind: BusinessKind;
  name: string;
  purchasedAt: string;
  baseGarageId: string;
  completedJobs: number;
  grossRevenue: number;
}

export interface ClockGuard {
  lastSeenAt: string;
  lastTrustedAt: string;
  rollbackDetected: boolean;
  unvalidated: boolean;
}

export interface RideHistoryEntry {
  id: string;
  passengerName: string;
  category: RideCategory;
  total: number;
  tip: number;
  rating: number;
  distanceKm: number;
  completedAt: string;
}

export interface DriverGoals {
  firstRide: boolean;
  fiveRides: boolean;
  collisionFreeRide: boolean;
  firstTip: boolean;
  firstRefuel: boolean;
  firstWorkshop: boolean;
  firstUpgrade: boolean;
  rating45: boolean;
  tenKm: boolean;
  thousandReais: boolean;
}

export type UpgradeLevels = Record<VehicleUpgradeId, number>;

export interface PlayerSave {
  saveVersion: number;
  revision: number;
  updatedAt: string;
  money: number;
  fuel: number;
  condition: number;
  xp: number;
  rating: number;
  completedRides: number;
  position: Point;
  rotation: number;
  settings: PlayerSettings;
  activeMission: MissionSnapshot | null;
  autopilotEnabled: boolean;
  ledger: LedgerTransaction[];
  debts: number;
  upgrades: UpgradeLevels;
  collisionDamage: number;
  maintenanceWear: number;
  totalKm: number;
  totalEarned: number;
  totalSpent: number;
  tipsEarned: number;
  driverLevel: number;
  ratingHistory: number[];
  rideHistory: RideHistoryEntry[];
  goals: DriverGoals;
  regularizationReady: boolean;
  visitedServices: string[];
  ownerId: string;
  professionalStatus: ProfessionalStatus;
  taxiLicense: TaxiLicense;
  taxiMeter: TaxiMeterSnapshot;
  officialTaxiRides: number;
  activeVehicleId: string;
  fleet: PlayerFleet;
  businesses: PlayerBusiness[];
  clockGuard: ClockGuard;
  mapVersion: string;
  currentChunk: string;
  currentRegion: string;
  currentRegionId: string;
  laneId: string | null;
  roadSegmentId: string | null;
  geographicPosition: { lat: number; lon: number } | null;
  localPosition: Point;
  lastSafePosition: Point;
  mapMigrationNotice: boolean;
  publicPlayerId: string;
  publicDriverName: string;
  publicAvatarId: PublicAvatarId;
  onlinePreference: OnlineModePreference;
  fleetPublicProfile: FleetPublicProfile;
  lastOnlineWorld: string;
  lastOnlineChunk: string;
  lastPublicSessionId: string | null;
  accountLinkState: AccountLinkState;
  preferredRegionId: RegionPreference;
  regionalFamiliarity: Record<string, RegionalFamiliarity>;
  favoriteServiceIds: string[];
  regionalBaseServiceId: string | null;
  lastCloudRevision: number;
  cloudLineageId: string;
}

export type Quality = 'automatic' | 'low' | 'medium' | 'high';
export type TrafficDensity = 'automatic' | 'low' | 'medium' | 'high';
export type CameraZoom = 'near' | 'normal' | 'far';

export interface PlayerSettings {
  quality: Quality;
  cameraMode: 'follow' | 'fixed';
  audio: boolean;
  masterVolume: number;
  engineVolume: number;
  effectsVolume: number;
  cameraShake: boolean;
  cameraZoom: CameraZoom;
  trafficDensity: TrafficDensity;
  showPlayerNames: boolean;
  showFleetNames: boolean;
  showPlayersOnMap: boolean;
  remoteSounds: boolean;
  onlineVisualLimit: number;
  publicPresence: boolean;
}

export interface OnlineHudSnapshot {
  mode: OnlineModePreference;
  state: OnlineConnectionState;
  accountLinkState: AccountLinkState;
  publicSessionId: string | null;
  nearbyPlayers: number;
  remoteEmployees: number;
  offlineDeployments: number;
  pingMs: number | null;
  quality: 'excellent' | 'good' | 'weak' | 'offline';
  subscribedTopics: string[];
  sendRateHz: number;
  receiveRateHz: number;
  sequence: number;
  interpolationBuffer: number;
  extrapolating: number;
  lostPackets: number;
  outOfOrderPackets: number;
  npcReplacements: number;
  reconnectAttempts: number;
  warning: string | null;
}

export type CollisionSeverity = 'contact' | 'light' | 'moderate' | 'severe';
export type TrafficVehicleState = 'cruising' | 'following' | 'braking' | 'stopped-signal' | 'stopped-traffic' | 'stunned' | 'recovering';

export interface HudSnapshot {
  ready: boolean;
  settings: PlayerSettings;
  money: number;
  speedKmh: number;
  fuel: number;
  fuelCapacity: number;
  condition: number;
  objective: string;
  distanceRemaining: number;
  etaSeconds: number;
  headingDelta: number;
  vehicleHeading: number;
  fps: number;
  redLightWarning: boolean;
  trafficVehicles: number;
  trafficBuses: number;
  trafficStunned: number;
  trafficGhosted: number;
  autopilotDeadlockRecoveries: number;
  collisionEvents: number;
  collisionSeverity: CollisionSeverity | null;
  collisionRelativeSpeedKmh: number;
  autopilotEnabled: boolean;
  autopilotNextMissionSeconds: number;
  autopilotRoadCorrections: number;
  autopilotMinRoadClearance: number;
  simulationSeconds: number;
  autopilotCollisionRecovery: boolean;
  autoBrakeReason: 'clear' | 'traffic' | 'red-signal';
  autopilotState: 'off' | 'cruising' | 'braking' | 'arriving' | 'waiting' | 'recovering';
  autopilotTargetSpeedKmh: number;
  trafficStopReason: string;
  repositionProgress: number;
  routeRecalculations: number;
  mission: MissionSnapshot | null;
  receipt: Receipt | null;
  ledger: LedgerTransaction[];
  debts: number;
  upgrades: UpgradeLevels;
  maintenanceWear: number;
  collisionDamage: number;
  totalKm: number;
  totalEarned: number;
  totalSpent: number;
  tipsEarned: number;
  driverLevel: number;
  rating: number;
  completedRides: number;
  goals: DriverGoals;
  regularizationReady: boolean;
  nearbyService: MapServiceLocation | null;
  selectedService: MapServiceLocation | null;
  airTraffic: number;
  trafficCapacity: number;
  trafficHardCeiling: number;
  trafficReservedSlots: number;
  serviceLocations: MapServiceLocation[];
  taxiPoints: TaxiPoint[];
  professionalStatus: ProfessionalStatus;
  taxiLicense: TaxiLicense;
  taxiMeter: TaxiMeterSnapshot;
  officialTaxiRides: number;
  activeVehicleId: string;
  fleet: PlayerFleet;
  businesses: PlayerBusiness[];
  fleetVehicleVisible: boolean;
  fleetRouteTarget: Point | null;
  fleetRouteRemaining: number;
  fleetRoutePathRemaining: number;
  fleetCompletedStops: number;
  fleetRouteRecoveries: number;
  fleetLastRecoveryReason: string | null;
  fleetDriverIdentification: string | null;
  totalTerrestrialEntities: number;
  mapVersion: string;
  currentRegion: string;
  currentChunk: string;
  loadedMapChunks: number;
  mapRegions: string[];
  regionCatalog: MapRegion[];
  preferredRegionId: RegionPreference;
  currentRegionId: string;
  regionalFamiliarity: Record<string, RegionalFamiliarity>;
  online: OnlineHudSnapshot;
}
