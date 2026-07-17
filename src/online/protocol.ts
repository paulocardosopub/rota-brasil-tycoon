import { GAME_CONFIG } from '../config/gameConfig';
import type { Point } from '../types/game';

export type OnlineControllerType = 'PLAYER' | 'EMPLOYEE' | 'OFFLINE_FLEET';
export type TurnSignal = 'none' | 'left' | 'right' | 'hazard';

export interface MovementSnapshot {
  protocolVersion: number;
  sessionId: string;
  publicPlayerId: string;
  vehicleId: string;
  sequence: number;
  serverTimeOffset: number;
  clientTime: number;
  mapVersion: string;
  chunkId: string;
  localX: number;
  localY: number;
  layer: number;
  heading: number;
  speed: number;
  acceleration: number;
  vehicleState: 'free' | 'occupied' | 'stopped';
  autopilot: boolean;
  turnSignal: TurnSignal;
  braking: boolean;
  controllerType: OnlineControllerType;
  vehicleModel: 'Hatch 1998' | 'Sedan 2012';
  colorId: 'amber' | 'blue' | 'green' | 'violet' | 'taxi';
  fleetPublicId: string | null;
}

// Tuple wire format. The field order is protocol-versioned and keeps movement
// comfortably below the configured 640-byte ceiling without leaking save data.
export type MovementWire = [
  number, string, string, string, number, number, number, string, string,
  number, number, number, number, number, number, string, number, string,
  number, string, string, string, string | null
];

export function serializeMovement(snapshot: MovementSnapshot): MovementWire {
  return [
    snapshot.protocolVersion, snapshot.sessionId, snapshot.publicPlayerId, snapshot.vehicleId,
    snapshot.sequence, snapshot.serverTimeOffset, snapshot.clientTime, snapshot.mapVersion,
    snapshot.chunkId, round(snapshot.localX, 100), round(snapshot.localY, 100), snapshot.layer,
    round(wrapAngle(snapshot.heading), 10_000), round(snapshot.speed, 100), round(snapshot.acceleration, 100),
    snapshot.vehicleState, snapshot.autopilot ? 1 : 0, snapshot.turnSignal, snapshot.braking ? 1 : 0,
    snapshot.controllerType, snapshot.vehicleModel, snapshot.colorId, snapshot.fleetPublicId
  ];
}

export function deserializeMovement(input: unknown): MovementSnapshot | null {
  if (!Array.isArray(input) || input.length !== 23) return null;
  const [protocolVersion, sessionId, publicPlayerId, vehicleId, sequence, serverTimeOffset, clientTime,
    mapVersion, chunkId, localX, localY, layer, heading, speed, acceleration, vehicleState, autopilot,
    turnSignal, braking, controllerType, vehicleModel, colorId, fleetPublicId] = input;
  const snapshot = {
    protocolVersion, sessionId, publicPlayerId, vehicleId, sequence, serverTimeOffset, clientTime,
    mapVersion, chunkId, localX, localY, layer, heading, speed, acceleration, vehicleState,
    autopilot: autopilot === 1, turnSignal, braking: braking === 1, controllerType, vehicleModel,
    colorId, fleetPublicId
  } as MovementSnapshot;
  return structurallyValid(snapshot) ? snapshot : null;
}

export type SnapshotRejection =
  | 'malformed' | 'protocol' | 'map-version' | 'session' | 'vehicle' | 'sequence'
  | 'chunk' | 'bounds' | 'speed' | 'acceleration' | 'teleport' | 'layer';

export type SnapshotValidation = { valid: true } | { valid: false; reason: SnapshotRejection; suspicious: boolean };

export function validateMovement(snapshot: MovementSnapshot | null, previous?: MovementSnapshot, expectedVehicleId?: string): SnapshotValidation {
  if (!snapshot || !structurallyValid(snapshot)) return reject('malformed');
  if (snapshot.protocolVersion !== GAME_CONFIG.online.protocolVersion) return reject('protocol');
  if (snapshot.mapVersion !== GAME_CONFIG.mapVersion) return reject('map-version');
  if (!/^rbs_[a-z0-9_-]{8,40}$/i.test(snapshot.sessionId)) return reject('session');
  if (!/^[a-z0-9][a-z0-9_-]{4,64}$/i.test(snapshot.vehicleId)) return reject('vehicle');
  if (expectedVehicleId && snapshot.vehicleId !== expectedVehicleId) return reject('vehicle', true);
  if (!/^[-]?\d+_[-]?\d+$/.test(snapshot.chunkId)) return reject('chunk');
  const margin = 80;
  if (snapshot.localX < -margin || snapshot.localY < -margin || snapshot.localX > GAME_CONFIG.map.chunkSizeMeters + margin || snapshot.localY > GAME_CONFIG.map.chunkSizeMeters + margin) return reject('bounds', true);
  if (Math.abs(snapshot.speed) > 75) return reject('speed', true);
  if (Math.abs(snapshot.acceleration) > 30) return reject('acceleration', true);
  if (!Number.isInteger(snapshot.layer) || Math.abs(snapshot.layer) > 8) return reject('layer', true);
  if (!previous) return { valid: true };
  if (snapshot.sequence <= previous.sequence) return reject('sequence');
  if (Math.abs(snapshot.layer - previous.layer) > 1) return reject('layer', true);
  const elapsed = Math.max(0.016, (snapshot.clientTime - previous.clientTime) / 1_000);
  const distance = worldDistance(previous, snapshot);
  const physicalAllowance = Math.max(20, (Math.abs(previous.speed) + Math.abs(snapshot.speed)) * 0.5 * elapsed + 14);
  if (distance > physicalAllowance && elapsed < 4) return reject('teleport', true);
  return { valid: true };
}

export function snapshotWorldPosition(snapshot: Pick<MovementSnapshot, 'chunkId' | 'localX' | 'localY'>): Point {
  const [chunkX, chunkY] = snapshot.chunkId.split('_').map(Number);
  return { x: chunkX * GAME_CONFIG.map.chunkSizeMeters + snapshot.localX, y: chunkY * GAME_CONFIG.map.chunkSizeMeters + snapshot.localY };
}

export function localPositionForChunk(position: Point, chunkId: string) {
  const [chunkX, chunkY] = chunkId.split('_').map(Number);
  return { x: position.x - chunkX * GAME_CONFIG.map.chunkSizeMeters, y: position.y - chunkY * GAME_CONFIG.map.chunkSizeMeters };
}

export function movementPayloadBytes(snapshot: MovementSnapshot) {
  return new TextEncoder().encode(JSON.stringify(serializeMovement(snapshot))).byteLength;
}

function structurallyValid(value: MovementSnapshot) {
  return Boolean(value)
    && [value.protocolVersion, value.sequence, value.serverTimeOffset, value.clientTime, value.localX, value.localY,
      value.layer, value.heading, value.speed, value.acceleration].every(Number.isFinite)
    && [value.sessionId, value.publicPlayerId, value.vehicleId, value.mapVersion, value.chunkId].every((item) => typeof item === 'string')
    && ['free', 'occupied', 'stopped'].includes(value.vehicleState)
    && ['none', 'left', 'right', 'hazard'].includes(value.turnSignal)
    && ['PLAYER', 'EMPLOYEE', 'OFFLINE_FLEET'].includes(value.controllerType)
    && ['Hatch 1998', 'Sedan 2012'].includes(value.vehicleModel)
    && ['amber', 'blue', 'green', 'violet', 'taxi'].includes(value.colorId)
    && (value.fleetPublicId === null || typeof value.fleetPublicId === 'string');
}

function worldDistance(a: MovementSnapshot, b: MovementSnapshot) {
  const ap = snapshotWorldPosition(a);
  const bp = snapshotWorldPosition(b);
  return Math.hypot(ap.x - bp.x, ap.y - bp.y);
}

function reject(reason: SnapshotRejection, suspicious = false): SnapshotValidation {
  return { valid: false, reason, suspicious };
}

function wrapAngle(value: number) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function round(value: number, scale: number) { return Math.round(value * scale) / scale; }
