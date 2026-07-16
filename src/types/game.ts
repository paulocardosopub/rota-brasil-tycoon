export type MissionPhase = 'pickup' | 'passenger-on-board' | 'completed' | 'cancelled';

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
}

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
}

export type Quality = 'automatic' | 'low' | 'medium' | 'high';

export interface PlayerSettings {
  quality: Quality;
  cameraMode: 'follow' | 'fixed';
  audio: boolean;
}

export interface HudSnapshot {
  ready: boolean;
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
  mission: MissionSnapshot | null;
  receipt: Receipt | null;
}
