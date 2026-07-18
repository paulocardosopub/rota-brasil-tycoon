import { GAME_CONFIG } from '../../config/gameConfig';
import type { CameraZoom, ClockGuard, DriverGoals, EmployeeRegionalPreferences, FleetEmployee, FleetVehicle, LedgerTransaction, PlayerFleet, PlayerSave, PlayerSettings, Quality, RegionalFamiliarity, TaxiLicense, TrafficDensity, UpgradeLevels } from '../../types/game';
import { createFleetVehicle } from '../../game/fleet/FleetService';
import { createTaxiMeter } from '../../game/taxi/TaxiMeter';
import { localMetersToLatLon } from '../../map/projection/localMeters';
import { DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES } from '../../game/regions/RegionalDefaults';

const MAP_ORIGIN = { lat: -15.7942, lon: -47.8822 };
const MAP_CHUNK_SIZE = 800;

const DEFAULT_SETTINGS: PlayerSettings = {
  quality: 'automatic',
  cameraMode: 'follow',
  audio: true,
  masterVolume: 0.7,
  engineVolume: 0.55,
  effectsVolume: 0.75,
  cameraShake: true,
  cameraZoom: 'normal',
  trafficDensity: 'automatic',
  showPlayerNames: true,
  showFleetNames: true,
  showPlayersOnMap: true,
  remoteSounds: true,
  onlineVisualLimit: GAME_CONFIG.online.maximumVisibleRemotes,
  publicPresence: true
};

export const DEFAULT_UPGRADES: UpgradeLevels = { engine: 0, brakes: 0, tires: 0, suspension: 0, economy: 0, comfort: 0 };
export const DEFAULT_GOALS: DriverGoals = {
  firstRide: false, fiveRides: false, collisionFreeRide: false, firstTip: false, firstRefuel: false,
  firstWorkshop: false, firstUpgrade: false, rating45: false, tenKm: false, thousandReais: false
};

export function createNewSave(position = { x: 0, y: 0 }): PlayerSave {
  const now = new Date().toISOString();
  const publicPlayerId = createPublicId('player');
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
      capacity: GAME_CONFIG.fleet.capacity, vehicles: [hatch], employees: [], activeShift: null, lastReport: null,
      garages: [centralGarage(now)]
    },
    clockGuard: { lastSeenAt: now, lastTrustedAt: now, rollbackDetected: false, unvalidated: true },
    mapVersion: GAME_CONFIG.mapVersion,
    currentChunk: chunkFor(position),
    currentRegion: 'Setores Centrais',
    currentRegionId: 'centro',
    laneId: null,
    roadSegmentId: null,
    geographicPosition: localMetersToLatLon(position.x, position.y, MAP_ORIGIN),
    localPosition: { ...position },
    lastSafePosition: { ...position },
    mapMigrationNotice: false,
    publicPlayerId,
    publicDriverName: `Motorista ${publicPlayerId.slice(-4).toUpperCase()}`,
    publicAvatarId: 'driver-green',
    onlinePreference: 'online',
    fleetPublicProfile: {
      fleetPublicId: createPublicId('fleet'), name: 'Minha Frota', tag: 'RBT', color: '#39d6a6',
      emblemId: 'road-star', publicVehicleCount: 1, status: 'offline'
    },
    lastOnlineWorld: GAME_CONFIG.online.worldId,
    lastOnlineChunk: chunkFor(position),
    lastPublicSessionId: null,
    accountLinkState: 'local',
    preferredRegionId: 'any',
    regionalFamiliarity: {},
    favoriteServiceIds: [],
    regionalBaseServiceId: null,
    lastCloudRevision: 0,
    cloudLineageId: createLineageId(),
    businesses: []
  };
}

export function migrateSave(input: unknown): PlayerSave {
  if (!input || typeof input !== 'object') return createNewSave();
  const raw = input as Partial<PlayerSave>;
  const previousSaveVersion = Number.isFinite(raw.saveVersion) ? raw.saveVersion! : 1;
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
    clockGuard: migrateClockGuard(raw.clockGuard, fresh.clockGuard),
    mapVersion: GAME_CONFIG.mapVersion,
    currentChunk: typeof raw.currentChunk === 'string' ? raw.currentChunk : chunkFor(raw.position ?? fresh.position),
    currentRegion: typeof raw.currentRegion === 'string' ? raw.currentRegion : 'Setores Centrais',
    currentRegionId: typeof raw.currentRegionId === 'string' ? raw.currentRegionId : legacyRegionId(raw.currentRegion),
    laneId: typeof raw.laneId === 'string' ? raw.laneId : null,
    roadSegmentId: typeof raw.roadSegmentId === 'string' ? raw.roadSegmentId : null,
    geographicPosition: validGeographicPosition(raw.geographicPosition)
      ? raw.geographicPosition
      : localMetersToLatLon((raw.position ?? fresh.position).x, (raw.position ?? fresh.position).y, MAP_ORIGIN),
    localPosition: validPoint(raw.localPosition) ? raw.localPosition : { ...(raw.position ?? fresh.position) },
    lastSafePosition: validPoint(raw.lastSafePosition) ? raw.lastSafePosition : { ...(raw.position ?? fresh.position) },
    mapMigrationNotice: previousSaveVersion < 5,
    publicPlayerId: validPublicId(raw.publicPlayerId) ? raw.publicPlayerId! : fresh.publicPlayerId,
    publicDriverName: normalizePublicName(raw.publicDriverName, fresh.publicDriverName),
    publicAvatarId: validChoice(raw.publicAvatarId, ['driver-amber', 'driver-blue', 'driver-green', 'driver-violet']) ?? fresh.publicAvatarId,
    onlinePreference: validChoice(raw.onlinePreference, ['online', 'solo']) ?? fresh.onlinePreference,
    fleetPublicProfile: migrateFleetPublicProfile(raw.fleetPublicProfile, fresh.fleetPublicProfile),
    lastOnlineWorld: typeof raw.lastOnlineWorld === 'string' ? raw.lastOnlineWorld : GAME_CONFIG.online.worldId,
    lastOnlineChunk: typeof raw.lastOnlineChunk === 'string' ? raw.lastOnlineChunk : (typeof raw.currentChunk === 'string' ? raw.currentChunk : fresh.currentChunk),
    lastPublicSessionId: typeof raw.lastPublicSessionId === 'string' ? raw.lastPublicSessionId : null,
    accountLinkState: validChoice(raw.accountLinkState, ['local', 'anonymous', 'pending-email', 'permanent']) ?? 'local',
    preferredRegionId: typeof raw.preferredRegionId === 'string' && raw.preferredRegionId ? raw.preferredRegionId : 'any',
    regionalFamiliarity: migrateRegionalFamiliarity(raw.regionalFamiliarity),
    favoriteServiceIds: Array.isArray(raw.favoriteServiceIds) ? [...new Set(raw.favoriteServiceIds.filter((id): id is string => typeof id === 'string'))].slice(0, 24) : [],
    regionalBaseServiceId: typeof raw.regionalBaseServiceId === 'string' ? raw.regionalBaseServiceId : null,
    lastCloudRevision: Math.max(0, Math.floor(finite(raw.lastCloudRevision, 0))),
    cloudLineageId: validLineageId(raw.cloudLineageId) ? raw.cloudLineageId! : fresh.cloudLineageId,
    businesses: Array.isArray(raw.businesses) ? raw.businesses.filter((business) => business && ['taxi','delivery','light-freight'].includes(business.kind)) : []
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
  return replaceSave(updated);
}

/** Persiste um snapshot completo sem criar uma revisão artificial. Usado
 * ao confirmar exatamente a revisão recebida ou enviada para a nuvem. */
export function replaceSave(save: PlayerSave) {
  const current = localStorage.getItem(GAME_CONFIG.storage.key);
  if (current) {
    try {
      JSON.parse(current);
      localStorage.setItem(GAME_CONFIG.storage.backupKey, current);
    } catch {
      localStorage.setItem(GAME_CONFIG.storage.corruptKey, current);
    }
  }
  localStorage.setItem(GAME_CONFIG.storage.key, JSON.stringify(save));
  return save;
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
    trafficDensity: validChoice(input?.trafficDensity, ['automatic', 'low', 'medium', 'high']) as TrafficDensity ?? DEFAULT_SETTINGS.trafficDensity,
    showPlayerNames: input?.showPlayerNames !== false,
    showFleetNames: input?.showFleetNames !== false,
    showPlayersOnMap: input?.showPlayersOnMap !== false,
    remoteSounds: input?.remoteSounds !== false,
    onlineVisualLimit: clamp(Math.floor(finite(input?.onlineVisualLimit, DEFAULT_SETTINGS.onlineVisualLimit)), 0, 50),
    publicPresence: input?.publicPresence !== false
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
    ? input.vehicles.map((vehicle) => migrateFleetVehicle(vehicle, save.ownerId, fleetId))
    : [legacyVehicle];
  return {
    id: fleetId, ownerId: save.ownerId,
    name: typeof input?.name === 'string' ? input.name : 'Minha Frota',
    garageServiceId: 'garage-shs-hatch', capacity: GAME_CONFIG.fleet.capacity,
    vehicles,
    employees: Array.isArray(input?.employees) ? input.employees.map(migrateEmployee) : [],
    activeShift: input?.activeShift && typeof input.activeShift === 'object' ? {
      ...input.activeShift,
      policy: {
        ...input.activeShift.policy,
        regional: migrateEmployeeRegionalPreferences(input.activeShift.policy?.regional)
      }
    } : null,
    lastReport: input?.lastReport && typeof input.lastReport === 'object' ? input.lastReport : null,
    garages: Array.isArray(input?.garages) && input.garages.length
      ? input.garages.map((garage) => ({ ...garage, vehicleCapacity: 5, employeeCapacity: 5 }))
      : [centralGarage(save.updatedAt)]
  };
}

function migrateFleetVehicle(input: FleetVehicle, ownerId: string, fleetId: string): FleetVehicle {
  const base = createFleetVehicle({
    id: typeof input.id === 'string' ? input.id : undefined,
    ownerId, fleetId, model: validVehicleModel(input.model),
    fuel: finite(input.fuel, 1), condition: finite(input.condition, 70),
    collisionDamage: finite(input.collisionDamage, 30), maintenanceWear: finite(input.maintenanceWear, 0),
    totalKm: finite(input.totalKm, 0), upgrades: migrateUpgrades(input.upgrades),
    position: input.position && Number.isFinite(input.position.x) && Number.isFinite(input.position.y) ? input.position : { x: 0, y: 0 },
    rotation: finite(input.rotation, 0), purchasePrice: finiteMoney(input.purchasePrice, 0), taxiLicensed: input.taxiLicensed === true
  });
  return { ...base, ...input, ownerId, fleetId, baseGarageId: typeof input.baseGarageId === 'string' ? input.baseGarageId : 'garage-shs-hatch', upgrades: migrateUpgrades(input.upgrades) };
}

function centralGarage(acquiredAt: string) {
  return {
    serviceId: 'garage-shs-hatch', regionId: 'centro', name: 'GARAGEM CENTRAL', acquiredAt,
    purchasePrice: 0, operatingCost: 0, vehicleCapacity: 5, employeeCapacity: 5
  };
}

function validDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

function validPoint(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: number; y?: number };
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validGeographicPosition(value: unknown): value is { lat: number; lon: number } {
  if (!value || typeof value !== 'object') return false;
  const point = value as { lat?: number; lon?: number };
  return Number.isFinite(point.lat) && Number.isFinite(point.lon);
}

function chunkFor(point: { x: number; y: number }) {
  return `${Math.floor(point.x / MAP_CHUNK_SIZE)}_${Math.floor(point.y / MAP_CHUNK_SIZE)}`;
}

function createPublicId(kind: 'player' | 'fleet') {
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${kind === 'player' ? 'rbp' : 'rbf'}_${value.slice(0, 24)}`;
}

function validPublicId(value: unknown) {
  return typeof value === 'string' && /^(rbp|rbf)_[a-z0-9]{8,32}$/i.test(value);
}

function normalizePublicName(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return normalized.length >= 3 && normalized.length <= 20 ? normalized : fallback;
}

function migrateEmployee(employee: FleetEmployee): FleetEmployee {
  return { ...employee, qualifications: Array.isArray(employee.qualifications) && employee.qualifications.length ? employee.qualifications : ['CAR','TAXI'], baseGarageId: typeof employee.baseGarageId === 'string' ? employee.baseGarageId : 'garage-shs-hatch', regionalPreferences: migrateEmployeeRegionalPreferences(employee.regionalPreferences) };
}

function validVehicleModel(model: FleetVehicle['model']): FleetVehicle['model'] {
  return ['Hatch 1998','Sedan 2012','Compacto 2010','Sedan Executivo 2018','SUV Urbano 2020','Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega','Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú'].includes(model) ? model : 'Hatch 1998';
}

function migrateEmployeeRegionalPreferences(input: Partial<EmployeeRegionalPreferences> | undefined): EmployeeRegionalPreferences {
  return {
    preferredRegionId: typeof input?.preferredRegionId === 'string' && input.preferredRegionId ? input.preferredRegionId : 'any',
    allowedRegionIds: Array.isArray(input?.allowedRegionIds) ? [...new Set(input.allowedRegionIds.filter((id): id is string => typeof id === 'string'))].slice(0, 16) : [],
    maximumDistanceKm: clamp(finite(input?.maximumDistanceKm, DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES.maximumDistanceKm), 1, 50),
    acceptLongTrips: input?.acceptLongTrips !== false,
    returnToPreferredRegion: input?.returnToPreferredRegion !== false,
    returnToGarage: input?.returnToGarage !== false,
    preferredFuelServiceId: typeof input?.preferredFuelServiceId === 'string' ? input.preferredFuelServiceId : null,
    preferredWorkshopServiceId: typeof input?.preferredWorkshopServiceId === 'string' ? input.preferredWorkshopServiceId : null,
    minimumCondition: clamp(finite(input?.minimumCondition, DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES.minimumCondition), 10, 95),
    minimumFuelPercent: clamp(finite(input?.minimumFuelPercent, DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES.minimumFuelPercent), 5, 80)
  };
}

function migrateRegionalFamiliarity(input: Record<string, RegionalFamiliarity> | undefined) {
  if (!input || typeof input !== 'object') return {};
  return Object.fromEntries(Object.entries(input).slice(0, 32).flatMap(([regionId, value]) => {
    if (!value || typeof value !== 'object') return [];
    return [[regionId, {
      regionId,
      completedRides: Math.max(0, Math.floor(finite(value.completedRides, 0))),
      kilometers: Math.max(0, finite(value.kilometers, 0)),
      pickupIds: Array.isArray(value.pickupIds) ? [...new Set(value.pickupIds.filter((id): id is string => typeof id === 'string'))].slice(-24) : [],
      destinationIds: Array.isArray(value.destinationIds) ? [...new Set(value.destinationIds.filter((id): id is string => typeof id === 'string'))].slice(-24) : [],
      corridorIds: value.corridorIds && typeof value.corridorIds === 'object' ? Object.fromEntries(Object.entries(value.corridorIds).filter(([, count]) => Number.isFinite(count)).slice(-32)) : {},
      workSeconds: Math.max(0, finite(value.workSeconds, 0)),
      ratingTotal: Math.max(0, finite(value.ratingTotal, 0)),
      ratingCount: Math.max(0, Math.floor(finite(value.ratingCount, 0))),
      recurringClients: Math.max(0, Math.floor(finite(value.recurringClients, 0)))
    } satisfies RegionalFamiliarity]];
  })) as Record<string, RegionalFamiliarity>;
}

function createLineageId() {
  const value = globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `rbl_${value.slice(0, 24)}`;
}

function validLineageId(value: unknown) {
  return typeof value === 'string' && /^rbl_[a-z0-9]{8,32}$/i.test(value);
}

function legacyRegionId(value: unknown) {
  if (typeof value !== 'string') return 'centro';
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const aliases: Record<string, string> = {
    'setores centrais': 'centro', centro: 'centro', 'asa sul': 'asa-sul', 'asa norte': 'asa-norte',
    sudoeste: 'sudoeste', cruzeiro: 'cruzeiro', noroeste: 'noroeste', 'vila planalto': 'vila-planalto',
    'universidade de brasilia': 'unb', 'lago sul': 'lago-sul', 'lago norte': 'lago-norte',
    'jardim botanico': 'jardim-botanico', aeroporto: 'aeroporto'
  };
  return aliases[normalized] ?? 'centro';
}

function migrateFleetPublicProfile(input: Partial<PlayerSave['fleetPublicProfile']> | undefined, fallback: PlayerSave['fleetPublicProfile']): PlayerSave['fleetPublicProfile'] {
  return {
    fleetPublicId: validPublicId(input?.fleetPublicId) ? input!.fleetPublicId! : fallback.fleetPublicId,
    name: normalizePublicName(input?.name, fallback.name),
    tag: typeof input?.tag === 'string' && /^[A-Z0-9]{2,5}$/.test(input.tag) ? input.tag : fallback.tag,
    color: typeof input?.color === 'string' && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : fallback.color,
    emblemId: validChoice(input?.emblemId, ['road-star', 'capital-wheel', 'cerrado-route']) ?? fallback.emblemId,
    publicVehicleCount: clamp(Math.floor(finite(input?.publicVehicleCount, fallback.publicVehicleCount)), 0, 99),
    status: validChoice(input?.status, ['active', 'offline']) ?? fallback.status
  };
}

function finite(value: unknown, fallback: number) { return Number.isFinite(value) ? value as number : fallback; }
function finiteMoney(value: unknown, fallback: number) { return Math.round(Math.max(0, finite(value, fallback)) * 100) / 100; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
