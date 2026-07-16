export type MissionPhase = 'offered' | 'pickup' | 'passenger-on-board' | 'completed' | 'cancelled';
export type RideCategory = 'popular' | 'urgent' | 'comfort';
export type TransactionKind = 'income' | 'expense' | 'debt' | 'adjustment';
export type TransactionCategory =
  | 'ride' | 'tip' | 'fuel' | 'repair' | 'upgrade' | 'fine' | 'reposition' | 'emergency' | 'dev';
export type VehicleUpgradeId = 'engine' | 'brakes' | 'tires' | 'suspension' | 'economy' | 'comfort';
export type ServiceCategory = 'fuel' | 'workshop' | 'garage';

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
}

export interface GraphEdge {
  to: string;
  distance: number;
  roadId: string;
}

export interface GraphNode extends Point {
  id: string;
  edges: GraphEdge[];
}

export interface NavigationGraph {
  nodes: GraphNode[];
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
  goals: DriverGoals;
  regularizationReady: boolean;
  nearbyService: MapServiceLocation | null;
  selectedService: MapServiceLocation | null;
  airTraffic: number;
  trafficCapacity: number;
  serviceLocations: MapServiceLocation[];
}
