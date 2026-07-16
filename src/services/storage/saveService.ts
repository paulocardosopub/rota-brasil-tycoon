import { GAME_CONFIG } from '../../config/gameConfig';
import type { CameraZoom, ClockGuard, DriverGoals, FleetVehicle, LedgerTransaction, PlayerFleet, PlayerSave, PlayerSettings, Quality, TaxiLicense, TrafficDensity, UpgradeLevels } from '../../types/game';
import { createFleetVehicle } from '../../game/fleet/FleetService';
import { createTaxiMeter } from '../../game/taxi/TaxiMeter';

const DEFAULT_SETTINGS: PlayerSettings = {
  quality: 'automatic',
  cameraMode: 'follow',
  audio: true,
  masterVolume: 0.7,
  engineVolume: 0.55,
  effectsVolume: 0.75,
  cameraShake: true,
  cameraZoom: 'normal',
  trafficDensity: 'automatic'
};

export const DEFAULT_UPGRADES: UpgradeLevels = { engine: 0, brakes: 0, tires: 0, suspension: 0, economy: 0, comfort: 0 };
export const DEFAULT_GOALS: DriverGoals = {
  firstRide: false, fiveRides: false, collisionFreeRide: false, firstTip: false, firstRefuel: false,
  firstWorkshop: false, firstUpgrade: false, rating45: false, tenKm: false, thousandReais: false
};

export function createNewSave(position = { x: 0, y: 0 }): PlayerSave {
  const now = new Date().toISOString();
  const ownerId = 'local-owner';
  const fleetId = 'fleet-local-owner';
  const hatch = createFleetVehicle({
    id: 'vehicle-hatch-1998', ownerId, fleetId, model: 'Hatch 1998',
    fuel: GAME_CONFIG.initialPlayer.fuel, condition: GAME_CONFIG.initialPlayer.condition,
    collisionDamage: 30, maintenanceWear: 0, totalKm: 0, upgrades: DEFAULT_UPGRADES,
    position, rotation: 0, purchasePrice: 0
  });
  const taxiLicense: TaxiLicense = {
    status: 'not-eligible', requestedAt: null, issuedAt: null, costPaid: 0, idempotencyKey: null,
    gameplayDisclaimer: 'Processo simplificado para fins de gameplay.'
  };
  return {
    saveVersion: GAME_CONFIG.saveVersion,
    revision: 1,
    updatedAt: now,
    ...GAME_CONFIG.initialPlayer,
    position,
    rotation: 0,
    settings: { ...DEFAULT_SETTINGS },
    activeMission: null,
    autopilotEnabled: false,
    ledger: [],
    debts: 0,
    upgrades: { ...DEFAULT_UPGRADES },
    collisionDamage: 30,
    maintenanceWear: 0,
    totalKm: 0,
    totalEarned: 0,
    totalSpent: 0,
    tipsEarned: 0,
    driverLevel: 1,
    ratingHistory: [],
    rideHistory: [],
    goals: { ...DEFAULT_GOALS },
    regularizationReady: false,
    visitedServices: [],
    ownerId,
    professionalStatus: 'clandestine',
    taxiLicense,
    taxiMeter: createTaxiMeter(),
    officialTaxiRides: 0,
    activeVehicleId: hatch.id,
    fleet: {
      id: fleetId, ownerId, name: 'Minha Frota', garageServiceId: 'garage-shs-hatch',
      capacity: GAME_CONFIG.fleet.capacity, vehicles: [hatch], employees: [], activeShift: null, lastReport: null
    },
    clockGuard: { lastSeenAt: now, lastTrustedAt: now, rollbackDetected: false, unvalidated: true }
  };
}

export function migrateSave(input: unknown): PlayerSave {
  if (!input || typeof input !== 'object') return createNewSave();
  const raw = input as Partial<PlayerSave>;
  const fresh = createNewSave(raw.position);
  const legacyCondition = finite(raw.condition, fresh.condition);
  const upgrades = migrateUpgrades(raw.upgrades);
  const ledger = Array.isArray(raw.ledger) ? raw.ledger.filter(validTransaction).slice(0, GAME_CONFIG.storage.ledgerLimit) : [];
  const migrated = {
    ...fresh,
    ...raw,
    saveVersion: GAME_CONFIG.saveVersion,
    revision: Number.isFinite(raw.revision) ? Math.max(1, raw.revision!) : 1,
    money: finiteMoney(raw.money, fresh.money),
    fuel: Number.isFinite(raw.fuel) ? Math.max(0, Math.min(40, raw.fuel!)) : fresh.fuel,
    condition: clamp(legacyCondition, 0, 100),
    position: raw.position && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.y) ? raw.position : fresh.position,
    settings: migrateSettings(raw.settings),
    activeMission: validMission(raw.activeMission) ? raw.activeMission : null,
    autopilotEnabled: raw.autopilotEnabled === true,
    ledger,
    debts: finiteMoney(raw.debts, 0),
    upgrades,
    collisionDamage: clamp(finite(raw.collisionDamage, Math.max(0, 100 - legacyCondition)), 0, 100),
    maintenanceWear: clamp(finite(raw.maintenanceWear, 0), 0, 100),
    totalKm: Math.max(0, finite(raw.totalKm, 0)),
    totalEarned: finiteMoney(raw.totalEarned, ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)),
    totalSpent: finiteMoney(raw.totalSpent, Math.abs(ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0))),
    tipsEarned: finiteMoney(raw.tipsEarned, 0),
    driverLevel: Math.max(1, Math.floor(finite(raw.driverLevel, 1))),
    ratingHistory: Array.isArray(raw.ratingHistory) ? raw.ratingHistory.filter(Number.isFinite).map((rating) => clamp(rating, 1, 5)).slice(-30) : [],
    rideHistory: Array.isArray(raw.rideHistory) ? raw.rideHistory.slice(0, GAME_CONFIG.storage.rideHistoryLimit) : [],
    goals: { ...DEFAULT_GOALS, ...(raw.goals ?? {}) },
    regularizationReady: raw.regularizationReady === true,
    visitedServices: Array.isArray(raw.visitedServices) ? [...new Set(raw.visitedServices.filter((id): id is string => typeof id === 'string'))] : [],
    ownerId: typeof raw.ownerId === 'string' && raw.ownerId ? raw.ownerId : fresh.ownerId,
    professionalStatus: raw.professionalStatus === 'licensed-taxi' ? 'licensed-taxi' as const : 'clandestine' as const,
    taxiLicense: migrateTaxiLicense(raw.taxiLicense, fresh.taxiLicense, raw.professionalStatus === 'licensed-taxi'),
    taxiMeter: { ...createTaxiMeter(), ...(raw.taxiMeter ?? {}) },
    officialTaxiRides: Math.max(0, Math.floor(finite(raw.officialTaxiRides, 0))),
    activeVehicleId: typeof raw.activeVehicleId === 'string' ? raw.activeVehicleId : fresh.activeVehicleId,
    fleet: fresh.fleet,
    clockGuard: migrateClockGuard(raw.clockGuard, fresh.clockGuard)
  };
  migrated.fleet = migrateFleet(raw.fleet, migrated);
  if (!migrated.fleet.vehicles.some((vehicle) => vehicle.id === migrated.activeVehicleId)) {
    migrated.activeVehicleId = migrated.fleet.vehicles[0].id;
  }
  if (migrated.regularizationReady && migrated.taxiLicense.status === 'not-eligible') migrated.taxiLicense.status = 'eligible';
  return migrated;
}

export function loadSave(): PlayerSave {
  const stored = localStorage.getItem(GAME_CONFIG.storage.key);
  if (!stored) return loadBackup() ?? createNewSave();
  try {
    const parsed = JSON.parse(stored) as Partial<PlayerSave>;
    if ((parsed.saveVersion ?? 0) < GAME_CONFIG.saveVersion) localStorage.setItem(GAME_CONFIG.storage.backupKey, stored);
    return migrateSave(parsed);
  } catch {
    // Mantém o dado original intacto para diagnóstico e recuperação manual.
    localStorage.setItem(GAME_CONFIG.storage.corruptKey, stored);
    return loadBackup() ?? createNewSave();
  }
}

export function writeSave(save: PlayerSave) {
  const now = new Date().toISOString();
  save.clockGuard.lastSeenAt = now;
  const updated: PlayerSave = {
    ...save,
    revision: save.revision + 1,
    updatedAt: now
  };
  const current = localStorage.getItem(GAME_CONFIG.storage.key);
  if (current) {
    try {
      JSON.parse(current);
      localStorage.setItem(GAME_CONFIG.storage.backupKey, current);
    } catch {
      localStorage.setItem(GAME_CONFIG.storage.corruptKey, current);
    }
  }
  localStorage.setItem(GAME_CONFIG.storage.key, JSON.stringify(updated));
  return updated;
}

export function deleteSave() {
  localStorage.removeItem(GAME_CONFIG.storage.key);
  localStorage.removeItem(GAME_CONFIG.storage.backupKey);
  localStorage.removeItem(GAME_CONFIG.storage.corruptKey);
}

function loadBackup() {
  const backup = localStorage.getItem(GAME_CONFIG.storage.backupKey);
  if (!backup) return null;
  try {
    return migrateSave(JSON.parse(backup));
  } catch {
    return null;
  }
}

function migrateSettings(input: Partial<PlayerSettings> | undefined): PlayerSettings {
  return {
    quality: validChoice(input?.quality, ['automatic', 'low', 'medium', 'high']) as Quality ?? DEFAULT_SETTINGS.quality,
    cameraMode: validChoice(input?.cameraMode, ['follow', 'fixed']) ?? DEFAULT_SETTINGS.cameraMode,
    audio: input?.audio !== false,
    masterVolume: volume(input?.masterVolume, DEFAULT_SETTINGS.masterVolume),
    engineVolume: volume(input?.engineVolume, DEFAULT_SETTINGS.engineVolume),
    effectsVolume: volume(input?.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    cameraShake: input?.cameraShake !== false,
    cameraZoom: validChoice(input?.cameraZoom, ['near', 'normal', 'far']) as CameraZoom ?? DEFAULT_SETTINGS.cameraZoom,
    trafficDensity: validChoice(input?.trafficDensity, ['automatic', 'low', 'medium', 'high']) as TrafficDensity ?? DEFAULT_SETTINGS.trafficDensity
  };
}

function validChoice<T extends string>(value: unknown, options: readonly T[]) {
  return typeof value === 'string' && options.includes(value as T) ? value as T : undefined;
}

function volume(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : fallback;
}

function validMission(value: PlayerSave['activeMission'] | undefined): value is NonNullable<PlayerSave['activeMission']> {
  if (!value || typeof value !== 'object') return false;
  if (!['offered', 'pickup', 'passenger-on-board'].includes(value.phase)) return false;
  return [value.pickup.x, value.pickup.y, value.destination.x, value.destination.y].every(Number.isFinite);
}

export function hasSave() {
  return Boolean(localStorage.getItem(GAME_CONFIG.storage.key));
}

function migrateUpgrades(input: Partial<UpgradeLevels> | undefined): UpgradeLevels {
  return Object.fromEntries(Object.entries(DEFAULT_UPGRADES).map(([id]) => [id, clamp(Math.floor(finite(input?.[id as keyof UpgradeLevels], 0)), 0, 3)])) as UpgradeLevels;
}

function validTransaction(value: unknown): value is LedgerTransaction {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<LedgerTransaction>;
  return typeof entry.id === 'string' && typeof entry.idempotencyKey === 'string'
    && Number.isFinite(entry.amount) && Number.isFinite(entry.balanceBefore) && Number.isFinite(entry.balanceAfter);
}

function migrateTaxiLicense(input: Partial<TaxiLicense> | undefined, fallback: TaxiLicense, licensed: boolean): TaxiLicense {
  return {
    ...fallback, ...(input ?? {}),
    status: licensed || input?.status === 'licensed' ? 'licensed' : input?.status === 'eligible' ? 'eligible' : 'not-eligible',
    costPaid: finiteMoney(input?.costPaid, 0),
    gameplayDisclaimer: 'Processo simplificado para fins de gameplay.'
  };
}

function migrateClockGuard(input: Partial<ClockGuard> | undefined, fallback: ClockGuard): ClockGuard {
  return {
    lastSeenAt: validDate(input?.lastSeenAt) ?? fallback.lastSeenAt,
    lastTrustedAt: validDate(input?.lastTrustedAt) ?? fallback.lastTrustedAt,
    rollbackDetected: input?.rollbackDetected === true,
    unvalidated: input?.unvalidated !== false
  };
}

function migrateFleet(input: Partial<PlayerFleet> | undefined, save: PlayerSave): PlayerFleet {
  const fleetId = typeof input?.id === 'string' ? input.id : `fleet-${save.ownerId}`;
  const legacyVehicle = createFleetVehicle({
    id: 'vehicle-hatch-1998', ownerId: save.ownerId, fleetId, model: 'Hatch 1998',
    fuel: save.fuel, condition: save.condition, collisionDamage: save.collisionDamage,
    maintenanceWear: save.maintenanceWear, totalKm: save.totalKm, upgrades: save.upgrades,
    position: save.position, rotation: save.rotation, purchasePrice: 0,
    taxiLicensed: save.professionalStatus === 'licensed-taxi'
  });
  const vehicles = Array.isArray(input?.vehicles) && input.vehicles.length
    ? input.vehicles.slice(0, GAME_CONFIG.fleet.capacity).map((vehicle) => migrateFleetVehicle(vehicle, save.ownerId, fleetId))
    : [legacyVehicle];
  return {
    id: fleetId, ownerId: save.ownerId,
    name: typeof input?.name === 'string' ? input.name : 'Minha Frota',
    garageServiceId: 'garage-shs-hatch', capacity: GAME_CONFIG.fleet.capacity,
    vehicles,
    employees: Array.isArray(input?.employees) ? input.employees.slice(0, GAME_CONFIG.fleet.maximumEmployees) : [],
    activeShift: input?.activeShift && typeof input.activeShift === 'object' ? input.activeShift : null,
    lastReport: input?.lastReport && typeof input.lastReport === 'object' ? input.lastReport : null
  };
}

function migrateFleetVehicle(input: FleetVehicle, ownerId: string, fleetId: string): FleetVehicle {
  const base = createFleetVehicle({
    id: typeof input.id === 'string' ? input.id : undefined,
    ownerId, fleetId, model: input.model === 'Sedan 2012' ? 'Sedan 2012' : 'Hatch 1998',
    fuel: finite(input.fuel, 1), condition: finite(input.condition, 70),
    collisionDamage: finite(input.collisionDamage, 30), maintenanceWear: finite(input.maintenanceWear, 0),
    totalKm: finite(input.totalKm, 0), upgrades: migrateUpgrades(input.upgrades),
    position: input.position && Number.isFinite(input.position.x) && Number.isFinite(input.position.y) ? input.position : { x: 0, y: 0 },
    rotation: finite(input.rotation, 0), purchasePrice: finiteMoney(input.purchasePrice, 0), taxiLicensed: input.taxiLicensed === true
  });
  return { ...base, ...input, ownerId, fleetId, upgrades: migrateUpgrades(input.upgrades) };
}

function validDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function finite(value: unknown, fallback: number) { return Number.isFinite(value) ? value as number : fallback; }
function finiteMoney(value: unknown, fallback: number) { return Math.round(Math.max(0, finite(value, fallback)) * 100) / 100; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
