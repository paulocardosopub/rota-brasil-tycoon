import { GAME_CONFIG } from '../../config/gameConfig';
import type { EmployeeCandidate, EmployeeRegionalPreferences, FleetEmployee, FleetReport, FleetShift, FleetSimulationLevel, FleetVehicle, MapServiceLocation, PlayerSave, Point, UpgradeLevels } from '../../types/game';
import { EconomyService } from '../economy/EconomyService';
import { roundMoney } from '../economy/TransactionLedger';
import { DEFAULT_SHIFT_POLICY, EMPLOYEE_CANDIDATES } from './FleetConfig';
import { DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES } from '../regions/RegionalDefaults';
import { ECONOMY_CONFIG } from '../economy/EconomyConfig';

export function createFleetVehicle(input: {
  id?: string; ownerId: string; fleetId: string; model: FleetVehicle['model'];
  fuel: number; condition: number; collisionDamage: number; maintenanceWear: number;
  totalKm: number; upgrades: UpgradeLevels; position: Point; rotation: number;
  purchasePrice: number; taxiLicensed?: boolean;
}): FleetVehicle {
  const now = new Date().toISOString();
  return {
    id: input.id ?? entityId('vehicle'), ownerId: input.ownerId, fleetId: input.fleetId,
    model: input.model, controllerType: 'PLAYER', controllerId: input.ownerId, authority: 'local',
    state: 'player-driving', simulationLevel: 'detailed', currentRegion: 'centro', currentChunk: 'active',
    stateVersion: 1, updatedAt: now, leaseExpiresAt: null,
    taxiLicensed: input.taxiLicensed ?? false, taxiVisualEnabled: input.taxiLicensed ?? false,
    taxiRegistrationId: input.taxiLicensed ? `taxi-${input.id ?? 'vehicle'}` : null,
    fuel: input.fuel, fuelCapacity: input.model === 'Sedan 2012' ? 48 : 40,
    condition: input.condition, collisionDamage: input.collisionDamage, maintenanceWear: input.maintenanceWear,
    totalKm: input.totalKm, upgrades: { ...input.upgrades }, position: { ...input.position }, rotation: input.rotation,
    purchasePrice: input.purchasePrice, acquiredAt: now, grossRevenue: 0, expenses: 0,
    nextMaintenanceKm: Math.ceil(input.totalKm / 100 + 1) * 100,
    baseGarageId: 'garage-shs-hatch'
  };
}

export function syncActiveVehicleFromLegacy(save: PlayerSave) {
  const vehicle = save.fleet.vehicles.find((candidate) => candidate.id === save.activeVehicleId);
  if (!vehicle) return;
  Object.assign(vehicle, {
    fuel: save.fuel, condition: save.condition, collisionDamage: save.collisionDamage,
    maintenanceWear: save.maintenanceWear, totalKm: save.totalKm, upgrades: { ...save.upgrades },
    position: { ...save.position }, rotation: save.rotation, updatedAt: new Date().toISOString()
  });
}

export function selectPlayerVehicle(save: PlayerSave, vehicleId: string) {
  const next = save.fleet.vehicles.find((vehicle) => vehicle.id === vehicleId);
  if (!next) return { applied: false, reason: 'missing' as const };
  if (save.fleet.activeShift?.vehicleId === vehicleId || next.controllerType === 'EMPLOYEE') return { applied: false, reason: 'in-use' as const };
  syncActiveVehicleFromLegacy(save);
  for (const vehicle of save.fleet.vehicles) {
    if (vehicle.id === save.activeVehicleId && vehicle.controllerType === 'PLAYER') {
      vehicle.state = 'parked'; vehicle.controllerId = null; vehicle.simulationLevel = 'economic';
    }
  }
  save.activeVehicleId = next.id;
  next.controllerType = 'PLAYER'; next.controllerId = save.ownerId; next.state = 'player-driving'; next.simulationLevel = 'detailed';
  save.fuel = next.fuel; save.condition = next.condition; save.collisionDamage = next.collisionDamage;
  save.maintenanceWear = next.maintenanceWear; save.totalKm = next.totalKm; save.upgrades = { ...next.upgrades };
  save.position = { ...next.position }; save.rotation = next.rotation;
  return { applied: true, vehicle: next };
}

export function hireEmployee(save: PlayerSave, candidateId: string, requestId: string) {
  if (save.professionalStatus !== 'licensed-taxi') return { applied: false, reason: 'not-licensed' as const };
  const garageId = save.fleet.garageServiceId;
  if (garageEmployeeCount(save, garageId) >= GAME_CONFIG.fleet.garageEmployeeCapacity) return { applied: false, reason: 'capacity' as const };
  if (save.fleet.employees.some((employee) => employee.id === candidateId)) return { applied: false, reason: 'duplicate' as const };
  const candidate = EMPLOYEE_CANDIDATES.find((item) => item.id === candidateId);
  if (!candidate) return { applied: false, reason: 'missing' as const };
  const result = new EconomyService(save).expense(candidate.hireCost, 'commission', `Contratação de ${candidate.name}`, requestId, false,
    fleetContext(save, 'none', candidate.id, 'none'));
  if (!result.applied) return result;
  const employee: FleetEmployee = {
    ...candidate, fleetId: save.fleet.id, ownerId: save.ownerId, state: 'waiting-vehicle',
    vehicleId: null, hiredAt: new Date().toISOString(), grossRevenue: 0, commissionPaid: 0, tripsCompleted: 0,
    regionalPreferences: { ...DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES, preferredRegionId: save.preferredRegionId },
    baseGarageId: garageId
  };
  save.fleet.employees.push(employee);
  return { applied: true, employee, transaction: result.transaction };
}

export function purchaseSecondVehicle(save: PlayerSave, requestId: string, garageService?: MapServiceLocation) {
  if (save.professionalStatus !== 'licensed-taxi') return { applied: false, reason: 'not-licensed' as const };
  const garageId = garageService?.id ?? save.fleet.garageServiceId;
  if (!save.fleet.garages.some((garage) => garage.serviceId === garageId)) return { applied: false, reason: 'garage' as const };
  if (garageVehicleCount(save, garageId) >= GAME_CONFIG.fleet.garageVehicleCapacity) return { applied: false, reason: 'capacity' as const };
  const result = new EconomyService(save).expense(
    GAME_CONFIG.fleet.secondVehiclePrice, 'fleet-purchase', 'Classificados da frota • Sedan 2012', requestId, false,
    fleetContext(save, 'pending-sedan', 'none', 'none')
  );
  if (!result.applied) return result;
  const garage = garageService?.stopPoint ?? { x: -744.378, y: 57.827 };
  const vehicle = createFleetVehicle({
    ownerId: save.ownerId, fleetId: save.fleet.id, model: 'Sedan 2012', fuel: 26,
    condition: GAME_CONFIG.fleet.secondVehicleCondition, collisionDamage: 18, maintenanceWear: 4,
    totalKm: 86_400, upgrades: { engine: 1, brakes: 1, tires: 1, suspension: 1, economy: 1, comfort: 1 },
    position: garage, rotation: 0, purchasePrice: GAME_CONFIG.fleet.secondVehiclePrice, taxiLicensed: true
  });
  vehicle.state = 'parked'; vehicle.controllerId = null; vehicle.simulationLevel = 'economic';
  vehicle.baseGarageId = garageId;
  save.fleet.vehicles.push(vehicle);
  if (result.transaction) {
    result.transaction.vehicleId = vehicle.id;
    result.transaction.metadata.vehicleId = vehicle.id;
  }
  return { applied: true, vehicle, transaction: result.transaction };
}

export function assignEmployee(save: PlayerSave, employeeId: string, vehicleId: string) {
  const employee = save.fleet.employees.find((item) => item.id === employeeId);
  const vehicle = save.fleet.vehicles.find((item) => item.id === vehicleId);
  if (!employee || !vehicle) return { applied: false, reason: 'missing' as const };
  if (vehicleId === save.activeVehicleId || vehicle.controllerType === 'EMPLOYEE' || save.fleet.activeShift?.vehicleId === vehicleId) return { applied: false, reason: 'vehicle-in-use' as const };
  if (save.fleet.employees.some((item) => item.id !== employeeId && item.vehicleId === vehicleId)) return { applied: false, reason: 'vehicle-assigned' as const };
  if (employee.vehicleId && employee.vehicleId !== vehicleId) {
    const previous = save.fleet.vehicles.find((item) => item.id === employee.vehicleId);
    if (previous && previous.id !== save.activeVehicleId) {
      previous.controllerType = 'PLAYER'; previous.controllerId = null; previous.state = 'parked';
    }
  }
  employee.vehicleId = vehicleId; employee.state = 'available';
  vehicle.controllerType = 'EMPLOYEE'; vehicle.controllerId = employee.id; vehicle.state = 'available';
  vehicle.stateVersion += 1; vehicle.updatedAt = new Date().toISOString();
  return { applied: true, employee, vehicle };
}

export function unassignEmployee(save: PlayerSave, employeeId: string) {
  if (save.fleet.activeShift?.employeeId === employeeId) return { applied: false, reason: 'shift-active' as const };
  const employee = save.fleet.employees.find((item) => item.id === employeeId);
  if (!employee) return { applied: false, reason: 'missing' as const };
  const vehicle = save.fleet.vehicles.find((item) => item.id === employee.vehicleId);
  if (vehicle && vehicle.id !== save.activeVehicleId) {
    vehicle.controllerType = 'PLAYER'; vehicle.controllerId = null; vehicle.state = 'parked';
    vehicle.stateVersion += 1; vehicle.updatedAt = new Date().toISOString();
  }
  employee.vehicleId = null; employee.state = 'waiting-vehicle';
  return { applied: true, employee, vehicle };
}

export function purchaseRegionalGarage(save: PlayerSave, service: MapServiceLocation, requestId: string) {
  if (service.category !== 'garage') return { applied: false, reason: 'invalid' as const };
  if (save.fleet.garages.some((garage) => garage.serviceId === service.id)) return { applied: false, reason: 'owned' as const };
  const result = new EconomyService(save).expense(GAME_CONFIG.fleet.regionalGaragePrice, 'fleet-purchase', `Garagem regional • ${service.gameName}`, requestId, false, fleetContext(save, 'none', 'none', 'none'));
  if (!result.applied) return result;
  const garage = {
    serviceId: service.id, regionId: service.regionId ?? 'centro', name: service.gameName,
    acquiredAt: new Date().toISOString(), purchasePrice: GAME_CONFIG.fleet.regionalGaragePrice,
    operatingCost: GAME_CONFIG.fleet.regionalGarageOperatingCost,
    vehicleCapacity: GAME_CONFIG.fleet.garageVehicleCapacity,
    employeeCapacity: GAME_CONFIG.fleet.garageEmployeeCapacity
  };
  save.fleet.garages.push(garage);
  return { applied: true, garage, transaction: result.transaction };
}

export function transferFleetEntity(save: PlayerSave, kind: 'vehicle' | 'employee', entityId: string, targetGarageId: string, requestId: string) {
  if (!save.fleet.garages.some((garage) => garage.serviceId === targetGarageId)) return { applied: false, reason: 'garage' as const };
  if (kind === 'vehicle') {
    const vehicle = save.fleet.vehicles.find((item) => item.id === entityId);
    if (!vehicle || vehicle.id === save.activeVehicleId || vehicle.controllerType === 'EMPLOYEE' || save.fleet.activeShift?.vehicleId === vehicle.id) return { applied: false, reason: 'in-use' as const };
    if (garageVehicleCount(save, targetGarageId) >= GAME_CONFIG.fleet.garageVehicleCapacity) return { applied: false, reason: 'capacity' as const };
    const charge = new EconomyService(save).expense(GAME_CONFIG.fleet.vehicleTransferCost, 'reposition', 'Transferência entre garagens', requestId, false, fleetContext(save, vehicle.id, 'none', 'none'));
    if (!charge.applied) return charge;
    vehicle.baseGarageId = targetGarageId; vehicle.updatedAt = new Date().toISOString(); vehicle.stateVersion += 1;
    return { applied: true, vehicle, transaction: charge.transaction };
  }
  const employee = save.fleet.employees.find((item) => item.id === entityId);
  if (!employee || save.fleet.activeShift?.employeeId === employee.id) return { applied: false, reason: 'in-use' as const };
  if (garageEmployeeCount(save, targetGarageId) >= GAME_CONFIG.fleet.garageEmployeeCapacity) return { applied: false, reason: 'capacity' as const };
  employee.baseGarageId = targetGarageId;
  return { applied: true, employee };
}

export function garageVehicleCount(save: PlayerSave, garageId: string) {
  return save.fleet.vehicles.filter((vehicle) => vehicle.baseGarageId === garageId).length;
}

export function garageEmployeeCount(save: PlayerSave, garageId: string) {
  return save.fleet.employees.filter((employee) => employee.baseGarageId === garageId).length;
}

export function updateEmployeeRegionalPreferences(
  save: PlayerSave,
  employeeId: string,
  patch: Partial<EmployeeRegionalPreferences>
) {
  if (save.fleet.activeShift?.employeeId === employeeId) return { applied: false, reason: 'shift-active' as const };
  const employee = save.fleet.employees.find((item) => item.id === employeeId);
  if (!employee) return { applied: false, reason: 'missing' as const };
  const next = { ...employee.regionalPreferences, ...patch };
  next.allowedRegionIds = [...new Set(next.allowedRegionIds)].filter(Boolean);
  next.maximumDistanceKm = Math.max(2, Math.min(30, Number(next.maximumDistanceKm) || 12));
  next.minimumCondition = Math.max(20, Math.min(90, Number(next.minimumCondition) || 45));
  next.minimumFuelPercent = Math.max(10, Math.min(80, Number(next.minimumFuelPercent) || 25));
  employee.regionalPreferences = next;
  return { applied: true, employee };
}

export function dismissEmployee(save: PlayerSave, employeeId: string) {
  if (save.fleet.activeShift?.employeeId === employeeId) return { applied: false, reason: 'shift-active' as const };
  const index = save.fleet.employees.findIndex((item) => item.id === employeeId);
  if (index < 0) return { applied: false, reason: 'missing' as const };
  unassignEmployee(save, employeeId);
  const [employee] = save.fleet.employees.splice(index, 1);
  return { applied: true, employee };
}

export function startFleetShift(save: PlayerSave, employeeId: string, requestId: string, now = new Date()) {
  if (save.fleet.activeShift) return { applied: false, reason: 'shift-active' as const };
  const employee = save.fleet.employees.find((item) => item.id === employeeId);
  const vehicle = save.fleet.vehicles.find((item) => item.id === employee?.vehicleId);
  if (!employee || !vehicle) return { applied: false, reason: 'assignment' as const };
  if (!vehicle.taxiLicensed) return { applied: false, reason: 'taxi-required' as const };
  if (vehicle.id === save.activeVehicleId) return { applied: false, reason: 'player-vehicle' as const };
  if (vehicle.fuel / vehicle.fuelCapacity * 100 < DEFAULT_SHIFT_POLICY.minimumFuelPercent || vehicle.condition < DEFAULT_SHIFT_POLICY.minimumCondition) {
    return { applied: false, reason: 'vehicle-unfit' as const };
  }
  const startedAt = now.toISOString();
  const shift: FleetShift = {
    id: entityId('shift'), fleetId: save.fleet.id, ownerId: save.ownerId, employeeId, vehicleId: vehicle.id,
    state: 'starting-shift', simulationLevel: 'detailed', startedAt, lastSimulatedAt: startedAt,
    scheduledEndAt: new Date(now.getTime() + DEFAULT_SHIFT_POLICY.durationMinutes * 60_000).toISOString(),
    tripId: null, routeProgress: 0, policy: {
      ...DEFAULT_SHIFT_POLICY,
      categories: [...DEFAULT_SHIFT_POLICY.categories],
      regional: { ...employee.regionalPreferences, allowedRegionIds: [...employee.regionalPreferences.allowedRegionIds] }
    },
    rides: 0, kilometers: 0, grossRevenue: 0, fuelCost: 0, commission: 0,
    maintenanceCost: 0, fines: 0, netProfit: 0
  };
  save.fleet.activeShift = shift;
  employee.state = 'starting-shift';
  vehicle.state = 'employee-driving'; vehicle.simulationLevel = 'detailed';
  vehicle.leaseExpiresAt = shift.scheduledEndAt; vehicle.updatedAt = startedAt; vehicle.stateVersion += 1;
  void requestId;
  return { applied: true, shift };
}

export function advanceFleetShift(save: PlayerSave, elapsedSeconds: number, offline = false) {
  const shift = save.fleet.activeShift;
  if (!shift || elapsedSeconds <= 0 || !Number.isFinite(elapsedSeconds)) return { completedRides: 0, report: null as FleetReport | null };
  const employee = save.fleet.employees.find((item) => item.id === shift.employeeId);
  const vehicle = save.fleet.vehicles.find((item) => item.id === shift.vehicleId);
  if (!employee || !vehicle) return { completedRides: 0, report: endFleetShift(save, ['Contrato ou veículo indisponível.']) };

  const remainingShift = Math.max(0, (Date.parse(shift.scheduledEndAt) - Date.parse(shift.lastSimulatedAt)) / 1_000);
  const seconds = Math.max(0, Math.min(elapsedSeconds, remainingShift));
  const tripSeconds = Math.max(250, 430 - employee.efficiency * 1.45);
  const totalProgress = shift.routeProgress + seconds;
  const completedRides = Math.floor(totalProgress / tripSeconds);
  shift.routeProgress = totalProgress % tripSeconds;
  shift.lastSimulatedAt = new Date(Date.parse(shift.lastSimulatedAt) + seconds * 1_000).toISOString();
  shift.state = fleetOperationalState(shift.routeProgress, tripSeconds);
  employee.state = shift.state;

  if (completedRides) settleFleetBatch(save, shift, employee, vehicle, completedRides, offline);
  const outOfFuel = vehicle.fuel <= 0.2;
  const maintenanceStop = vehicle.condition < shift.policy.minimumCondition;
  const scheduledEnd = Date.parse(shift.lastSimulatedAt) >= Date.parse(shift.scheduledEndAt) - 1;
  let report: FleetReport | null = null;
  if (outOfFuel || maintenanceStop || scheduledEnd || (shift.policy.pauseOnLoss && shift.netProfit < -20)) {
    const occurrences = [
      ...(outOfFuel ? ['Turno encerrado por combustível insuficiente.'] : []),
      ...(maintenanceStop ? ['Turno encerrado para manutenção.'] : []),
      ...(scheduledEnd ? ['Duração planejada concluída.'] : []),
      ...(shift.netProfit < -20 ? ['Operação pausada para evitar prejuízo.'] : [])
    ];
    report = endFleetShift(save, occurrences);
  }
  return { completedRides, report };
}

export function simulateOfflineReturn(save: PlayerSave, now = new Date()) {
  const nowMs = now.getTime();
  const lastSeenMs = Date.parse(save.clockGuard.lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) { save.clockGuard.lastSeenAt = now.toISOString(); return null; }
  if (nowMs < lastSeenMs) {
    save.clockGuard.rollbackDetected = true; save.clockGuard.unvalidated = true;
    return save.fleet.activeShift ? endFleetShift(save, ['Relógio local recuou; nenhum ganho offline foi aplicado.'], true) : null;
  }
  if (!save.fleet.activeShift) { save.clockGuard.lastSeenAt = now.toISOString(); return null; }
  const rawSeconds = (nowMs - lastSeenMs) / 1_000;
  if (rawSeconds < 30) return null;
  const maximum = GAME_CONFIG.fleet.offlineMaximumHours * 3_600;
  const capped = Math.min(rawSeconds, maximum);
  const first = Math.min(capped, GAME_CONFIG.fleet.reducedEfficiencyAfterHours * 3_600);
  const reduced = Math.max(0, capped - first) * 0.65;
  save.clockGuard.unvalidated = true;
  if (rawSeconds > maximum) save.clockGuard.unvalidated = true;
  const result = advanceFleetShift(save, first + reduced, true);
  const report = result.report ?? snapshotFleetReport(save, [
    'Operação offline calculada por veículo, motorista, combustível e condição.',
    ...(rawSeconds > maximum ? [`Acúmulo limitado a ${GAME_CONFIG.fleet.offlineMaximumHours} horas.`] : [])
  ], true);
  save.fleet.lastReport = report;
  save.clockGuard.lastSeenAt = now.toISOString();
  return report;
}

export function endFleetShift(save: PlayerSave, occurrences: string[] = [], unvalidatedClock = false) {
  const shift = save.fleet.activeShift;
  if (!shift) return null;
  const employee = save.fleet.employees.find((item) => item.id === shift.employeeId);
  const vehicle = save.fleet.vehicles.find((item) => item.id === shift.vehicleId);
  const report = reportFromShift(shift, occurrences, unvalidatedClock);
  if (employee) employee.state = 'resting';
  if (vehicle) {
    vehicle.state = shift.policy.returnToGarage ? 'parked' : 'available';
    vehicle.simulationLevel = 'economic'; vehicle.leaseExpiresAt = null;
    vehicle.updatedAt = new Date().toISOString(); vehicle.stateVersion += 1;
  }
  save.fleet.activeShift = null;
  save.fleet.lastReport = report;
  return report;
}

export function fleetSimulationLevel(distanceMeters: number): FleetSimulationLevel {
  if (distanceMeters <= GAME_CONFIG.fleet.physicalDetailRadiusMeters) return 'detailed';
  if (distanceMeters <= GAME_CONFIG.fleet.simplifiedRadiusMeters) return 'simplified';
  return 'economic';
}

export function fleetOperationalState(routeProgress: number, tripSeconds: number): FleetEmployee['state'] {
  if (!Number.isFinite(routeProgress) || !Number.isFinite(tripSeconds) || tripSeconds <= 0) return 'seeking-trip';
  return routeProgress / tripSeconds < 0.36 ? 'seeking-trip' : 'with-passenger';
}

export function acknowledgeFleetReport(save: PlayerSave) {
  if (save.fleet.lastReport) save.fleet.lastReport.acknowledged = true;
}

function settleFleetBatch(save: PlayerSave, shift: FleetShift, employee: FleetEmployee, vehicle: FleetVehicle, rides: number, offline: boolean) {
  const startRide = shift.rides;
  const distancePerRide = vehicle.model === 'Sedan 2012' ? 1.55 : 1.35;
  const grossPerRide = ECONOMY_CONFIG.fleet.grossBasePerRide
    + employee.service * ECONOMY_CONFIG.fleet.serviceFactor
    + employee.efficiency * ECONOMY_CONFIG.fleet.efficiencyFactor
    + (vehicle.model === 'Sedan 2012' ? ECONOMY_CONFIG.fleet.sedanBonus : 0);
  const gross = roundMoney(grossPerRide * rides);
  const commission = roundMoney(gross * employee.commissionPercent / 100);
  const kilometers = distancePerRide * rides;
  const kmPerLiter = (vehicle.model === 'Sedan 2012' ? 9.7 : 8.8) * (0.9 + employee.efficiency / 1_000);
  const liters = Math.min(vehicle.fuel, kilometers / kmPerLiter);
  const fuelCost = roundMoney(liters * GAME_CONFIG.services.fuelPricePerLiter);
  const maintenance = roundMoney(kilometers * (vehicle.model === 'Sedan 2012'
    ? ECONOMY_CONFIG.fleet.sedanMaintenancePerKilometer
    : ECONOMY_CONFIG.fleet.hatchMaintenancePerKilometer));
  const fineCount = employee.safety < 75 ? Math.floor((startRide + rides) / 8) - Math.floor(startRide / 8) : 0;
  const fines = fineCount * 4;
  const tripId = `${shift.id}-batch-${startRide + 1}-${startRide + rides}`;
  const context = fleetContext(save, vehicle.id, employee.id, tripId);
  const economy = new EconomyService(save);
  economy.income(gross, 'fleet-revenue', `${offline ? 'Operação offline' : 'Turno'} • ${employee.name}`, `${tripId}-income`, tripId, context);
  if (commission) economy.expense(commission, 'commission', `Comissão • ${employee.name}`, `${tripId}-commission`, false, context);
  if (fuelCost) economy.expense(fuelCost, 'fuel', `Combustível da frota • ${vehicle.model}`, `${tripId}-fuel`, false, context);
  if (maintenance) economy.expense(maintenance, 'fleet-maintenance', `Reserva de manutenção • ${vehicle.model}`, `${tripId}-maintenance`, false, context);
  if (fines) economy.expense(fines, 'fine', `Ocorrências do turno • ${employee.name}`, `${tripId}-fines`, false, context);
  const net = roundMoney(gross - commission - fuelCost - maintenance - fines);
  shift.rides += rides; shift.kilometers += kilometers; shift.grossRevenue = roundMoney(shift.grossRevenue + gross);
  shift.fuelCost = roundMoney(shift.fuelCost + fuelCost); shift.commission = roundMoney(shift.commission + commission);
  shift.maintenanceCost = roundMoney(shift.maintenanceCost + maintenance); shift.fines = roundMoney(shift.fines + fines);
  shift.netProfit = roundMoney(shift.netProfit + net); shift.tripId = tripId;
  employee.tripsCompleted += rides; employee.grossRevenue = roundMoney(employee.grossRevenue + gross);
  employee.commissionPaid = roundMoney(employee.commissionPaid + commission);
  vehicle.fuel = Math.max(0, vehicle.fuel - liters); vehicle.totalKm += kilometers;
  vehicle.maintenanceWear = Math.min(100, vehicle.maintenanceWear + kilometers * ECONOMY_CONFIG.fleet.wearPerKilometer);
  vehicle.condition = Math.max(0, 100 - vehicle.collisionDamage - vehicle.maintenanceWear * 0.45);
  vehicle.grossRevenue = roundMoney(vehicle.grossRevenue + gross);
  vehicle.expenses = roundMoney(vehicle.expenses + commission + fuelCost + maintenance + fines);
  vehicle.updatedAt = shift.lastSimulatedAt; vehicle.stateVersion += 1;
}

function snapshotFleetReport(save: PlayerSave, occurrences: string[], unvalidatedClock: boolean) {
  const shift = save.fleet.activeShift;
  return shift ? reportFromShift(shift, occurrences, unvalidatedClock) : null;
}

function reportFromShift(shift: FleetShift, occurrences: string[], unvalidatedClock: boolean): FleetReport {
  return {
    id: entityId('report'), shiftId: shift.id,
    elapsedMinutes: Math.max(0, Math.round((Date.parse(shift.lastSimulatedAt) - Date.parse(shift.startedAt)) / 60_000)),
    unvalidatedClock, rides: shift.rides, kilometers: roundMoney(shift.kilometers), grossRevenue: shift.grossRevenue,
    fuelCost: shift.fuelCost, commission: shift.commission, repairs: shift.maintenanceCost, fines: shift.fines,
    netProfit: shift.netProfit, finalState: shift.state, occurrences, createdAt: new Date().toISOString(), acknowledged: false
  };
}

function fleetContext(save: PlayerSave, vehicleId: string, driverId: string, tripId: string) {
  return { vehicleId, driverId, fleetId: save.fleet.id, tripId, ownerId: save.ownerId };
}

export function entityId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}
