import { GAME_CONFIG } from '../../config/gameConfig';
import type { BusinessKind, EmployeeCandidate, EmployeeQualification, EmployeeRegionalPreferences, FleetEmployee, FleetReport, FleetShift, FleetSimulationLevel, FleetVehicle, MapServiceLocation, PlayerSave, Point, UpgradeLevels, VehicleModel } from '../../types/game';
import { EconomyService } from '../economy/EconomyService';
import { roundMoney } from '../economy/TransactionLedger';
import { DEFAULT_SHIFT_POLICY, EMPLOYEE_CANDIDATES } from './FleetConfig';
import { DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES } from '../regions/RegionalDefaults';
import { averageWorldConditions, periodAt } from '../time/WorldClock';
import { ECONOMY_CONFIG } from '../economy/EconomyConfig';
import { workshopPrice } from '../economy/ExpenseCalculator';

export function createFleetVehicle(input: {
  id?: string; ownerId: string; fleetId: string; model: FleetVehicle['model'];
  fuel: number; condition: number; collisionDamage: number; maintenanceWear: number;
  totalKm: number; upgrades: UpgradeLevels; position: Point; rotation: number;
  purchasePrice: number; taxiLicensed?: boolean;
}): FleetVehicle {
  const now = new Date().toISOString();
  const bus = busVehicleSpec(input.model);
  return {
    id: input.id ?? entityId('vehicle'), ownerId: input.ownerId, fleetId: input.fleetId,
    model: input.model, controllerType: 'PLAYER', controllerId: input.ownerId, authority: 'local',
    state: 'player-driving', simulationLevel: 'detailed', currentRegion: 'centro', currentChunk: 'active',
    stateVersion: 1, updatedAt: now, leaseExpiresAt: null,
    taxiLicensed: input.taxiLicensed ?? false, taxiVisualEnabled: input.taxiLicensed ?? false,
    taxiRegistrationId: input.taxiLicensed ? `taxi-${input.id ?? 'vehicle'}` : null,
    fuel: input.fuel, fuelCapacity: vehicleSpec(input.model).fuelCapacity,
    condition: input.condition, collisionDamage: input.collisionDamage, maintenanceWear: input.maintenanceWear,
    totalKm: input.totalKm, upgrades: { ...input.upgrades }, position: { ...input.position }, rotation: input.rotation,
    purchasePrice: input.purchasePrice, acquiredAt: now, grossRevenue: 0, expenses: 0,
    nextMaintenanceKm: Math.ceil(input.totalKm / 100 + 1) * 100,
    baseGarageId: 'garage-shs-hatch',
    cargoCapacityKg: vehicleSpec(input.model).cargoKg,
    cargoVolumeM3: vehicleSpec(input.model).volumeM3,
    ...(bus ?? {})
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

export function purchaseSecondVehicle(save: PlayerSave, requestId: string, garageService?: MapServiceLocation, model: 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020' = 'Sedan 2012') {
  if (save.professionalStatus !== 'licensed-taxi') return { applied: false, reason: 'not-licensed' as const };
  const garageId = garageService?.id ?? save.fleet.garageServiceId;
  if (!save.fleet.garages.some((garage) => garage.serviceId === garageId)) return { applied: false, reason: 'garage' as const };
  if (garageVehicleCount(save, garageId) >= GAME_CONFIG.fleet.garageVehicleCapacity) return { applied: false, reason: 'capacity' as const };
  const price = model === 'Sedan 2012' ? GAME_CONFIG.fleet.secondVehiclePrice : GAME_CONFIG.fleet.passengerVehiclePrices[model];
  const result = new EconomyService(save).expense(
    price, 'fleet-purchase', `Classificados da frota • ${model}`, requestId, false,
    fleetContext(save, 'pending-sedan', 'none', 'none')
  );
  if (!result.applied) return result;
  const garage = garageService?.stopPoint ?? { x: -744.378, y: 57.827 };
  const vehicle = createFleetVehicle({
    ownerId: save.ownerId, fleetId: save.fleet.id, model, fuel: 26,
    condition: GAME_CONFIG.fleet.secondVehicleCondition, collisionDamage: 18, maintenanceWear: 4,
    totalKm: 86_400, upgrades: { engine: 1, brakes: 1, tires: 1, suspension: 1, economy: 1, comfort: 1 },
    position: garage, rotation: 0, purchasePrice: price, taxiLicensed: true
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
  if (employee.vehicleId === vehicleId && vehicle.controllerId === employeeId) return { applied: false, reason: 'duplicate' as const };
  if (!employee.qualifications.includes(requiredQualification(vehicle.model))) return { applied: false, reason: 'qualification' as const };
  if (vehicleId === save.activeVehicleId || save.fleet.activeShift?.vehicleId === vehicleId) return { applied: false, reason: 'vehicle-in-use' as const };
  const previousDriver = save.fleet.employees.find((item) => item.id !== employeeId && item.vehicleId === vehicleId);
  if (previousDriver) unassignEmployee(save, previousDriver.id);
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

export function busVehicleSpec(model: VehicleModel) {
  if (model === 'Micro-ônibus Urbano') return { seatedCapacity: 18, passengerCapacity: 24, lengthMeters: 8.2, widthMeters: 2.35, turningRadiusMeters: 8.1, maintenanceCostPerKm: 0.72 };
  if (model === 'Ônibus Urbano Convencional') return { seatedCapacity: 36, passengerCapacity: 72, lengthMeters: 12.6, widthMeters: 2.5, turningRadiusMeters: 10.8, maintenanceCostPerKm: 1.18 };
  return null;
}

function requiredQualification(model: VehicleModel): EmployeeQualification {
  if (model === 'Micro-ônibus Urbano' || model === 'Ônibus Urbano Convencional') return 'BUS';
  if (['Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200'].includes(model)) return 'MOTORCYCLE';
  if (model === 'Hatch Entrega' || model === 'Furgão Compacto' || model === 'Picape Leve') return 'DELIVERY_VAN';
  if (['Van de Carga','Furgão Médio','Utilitário Baú'].includes(model)) return 'LIGHT_FREIGHT';
  return ['Sedan 2012','Compacto 2010','Sedan Executivo 2018','SUV Urbano 2020'].includes(model) ? 'TAXI' : 'CAR';
}

export function availableCandidates(save: PlayerSave, maximum = 8) {
  const hired = new Set(save.fleet.employees.map((employee) => employee.id));
  return EMPLOYEE_CANDIDATES.filter((candidate) => !hired.has(candidate.id)).slice(0, maximum);
}

export function purchaseBusiness(save: PlayerSave, kind: Exclude<BusinessKind, 'taxi'>, garageId: string, requestId: string) {
  if (save.businesses.some((business) => business.kind === kind)) return { applied: false, reason: 'owned' as const };
  if (!save.fleet.garages.some((garage) => garage.serviceId === garageId)) return { applied: false, reason: 'garage' as const };
  if (kind === 'delivery' && save.completedRides < 5) return { applied: false, reason: 'requirements' as const };
  if (kind === 'light-freight' && (!save.businesses.some((business) => business.kind === 'delivery') || save.completedRides < 10)) return { applied: false, reason: 'requirements' as const };
  if (kind === 'bus' && (!save.businesses.some((business) => business.kind === 'light-freight') || save.completedRides < 15)) return { applied: false, reason: 'requirements' as const };
  const price = kind === 'delivery' ? GAME_CONFIG.fleet.deliveryBusinessPrice : kind === 'light-freight' ? GAME_CONFIG.fleet.freightBusinessPrice : GAME_CONFIG.fleet.busBusinessPrice;
  const name = kind === 'delivery' ? 'Central de Entregas' : kind === 'light-freight' ? 'Frete Brasília' : 'Rota Coletiva Brasília';
  const result = new EconomyService(save).expense(price, 'fleet-purchase', `Empresa • ${name}`, requestId, false, fleetContext(save, 'none', 'none', 'none'));
  if (!result.applied) return result;
  const business = { kind, name, purchasedAt: new Date().toISOString(), baseGarageId: garageId, completedJobs: 0, grossRevenue: 0 };
  save.businesses.push(business);
  return { applied: true, business, transaction: result.transaction };
}

export function purchaseLightVehicle(save: PlayerSave, model: Exclude<VehicleModel, 'Hatch 1998' | 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020'>, garageService: MapServiceLocation, requestId: string) {
  const garage = save.fleet.garages.find((item) => item.serviceId === garageService.id);
  if (!garage) return { applied: false, reason: 'garage' as const };
  if (garageVehicleCount(save, garage.serviceId) >= 5) return { applied: false, reason: 'capacity' as const };
  const requiredBusiness = ['Micro-ônibus Urbano','Ônibus Urbano Convencional'].includes(model) ? 'bus' : ['Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega'].includes(model) ? 'delivery' : 'light-freight';
  if (!save.businesses.some((business) => business.kind === requiredBusiness)) return { applied: false, reason: 'business' as const };
  if ((model === 'Van de Carga' && garage.regionId === 'centro') || (requiredBusiness === 'bus' && !['centro','asa-sul','sudoeste'].includes(garage.regionId))) return { applied: false, reason: 'incompatible' as const };
  const price = GAME_CONFIG.fleet.vehiclePrices[model];
  const result = new EconomyService(save).expense(price, 'fleet-purchase', `Veículo • ${model}`, requestId, false, fleetContext(save, 'pending', 'none', 'none'));
  if (!result.applied) return result;
  const vehicle = createFleetVehicle({ ownerId: save.ownerId, fleetId: save.fleet.id, model, fuel: vehicleSpec(model).initialFuel, condition: 86, collisionDamage: 10, maintenanceWear: 2, totalKm: 0, upgrades: { engine: 0, brakes: 0, tires: 0, suspension: 0, economy: 0, comfort: 0 }, position: garageService.stopPoint, rotation: 0, purchasePrice: price });
  vehicle.state = 'parked'; vehicle.controllerId = null; vehicle.simulationLevel = 'economic'; vehicle.baseGarageId = garage.serviceId;
  save.fleet.vehicles.push(vehicle);
  return { applied: true, vehicle, transaction: result.transaction };
}

export function trainEmployee(save: PlayerSave, employeeId: string, qualification: EmployeeQualification, requestId: string) {
  const employee = save.fleet.employees.find((item) => item.id === employeeId);
  if (!employee || save.fleet.activeShift?.employeeId === employeeId) return { applied: false, reason: 'in-use' as const };
  if (employee.qualifications.includes(qualification)) return { applied: false, reason: 'trained' as const };
  const trainingCost = qualification === 'BUS' ? GAME_CONFIG.fleet.busQualificationCost : GAME_CONFIG.fleet.employeeTrainingCost;
  const result = new EconomyService(save).expense(trainingCost, 'commission', `Treinamento • ${qualification}`, requestId, false, fleetContext(save, 'none', employeeId, 'none'));
  if (!result.applied) return result;
  employee.qualifications.push(qualification);
  return { applied: true, employee, transaction: result.transaction };
}

function vehicleSpec(model: VehicleModel) {
  if (model === 'Micro-ônibus Urbano') return { fuelCapacity: 110, initialFuel: 62, cargoKg: 1_900, volumeM3: 18 };
  if (model === 'Ônibus Urbano Convencional') return { fuelCapacity: 220, initialFuel: 125, cargoKg: 5_500, volumeM3: 42 };
  if (model === 'Moto Urbana 125') return { fuelCapacity: 12, initialFuel: 8, cargoKg: 18, volumeM3: 0.08 };
  if (model === 'Moto Cargo 160') return { fuelCapacity: 14, initialFuel: 9, cargoKg: 35, volumeM3: 0.16 };
  if (model === 'Scooter Express 150') return { fuelCapacity: 11, initialFuel: 7, cargoKg: 22, volumeM3: 0.11 };
  if (model === 'Triciclo Cargo 200') return { fuelCapacity: 16, initialFuel: 10, cargoKg: 120, volumeM3: 0.75 };
  if (model === 'Hatch Entrega') return { fuelCapacity: 44, initialFuel: 25, cargoKg: 320, volumeM3: 1.3 };
  if (model === 'Furgão Compacto') return { fuelCapacity: 55, initialFuel: 30, cargoKg: 650, volumeM3: 3.2 };
  if (model === 'Van de Carga') return { fuelCapacity: 70, initialFuel: 38, cargoKg: 1_400, volumeM3: 8.5 };
  if (model === 'Picape Leve') return { fuelCapacity: 62, initialFuel: 34, cargoKg: 850, volumeM3: 2.2 };
  if (model === 'Furgão Médio') return { fuelCapacity: 78, initialFuel: 42, cargoKg: 1_800, volumeM3: 11 };
  if (model === 'Utilitário Baú') return { fuelCapacity: 92, initialFuel: 50, cargoKg: 2_400, volumeM3: 15 };
  return { fuelCapacity: model === 'Sedan 2012' ? 48 : 40, initialFuel: 26, cargoKg: 80, volumeM3: 0.45 };
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

function createPreShiftRepair(
  save: PlayerSave,
  employee: FleetEmployee,
  vehicle: FleetVehicle,
  requestId: string,
  now: Date,
  serviceLocations: MapServiceLocation[]
) {
  const workshops = serviceLocations.filter((service) => service.category === 'workshop');
  const preferred = workshops.find((service) => service.id === employee.regionalPreferences.preferredWorkshopServiceId);
  const nearest = preferred ?? workshops.reduce<MapServiceLocation | undefined>((best, service) => {
    if (!best) return service;
    const distance = Math.hypot(service.stopPoint.x - vehicle.position.x, service.stopPoint.y - vehicle.position.y);
    const bestDistance = Math.hypot(best.stopPoint.x - vehicle.position.x, best.stopPoint.y - vehicle.position.y);
    return distance < bestDistance ? service : best;
  }, undefined);
  const garage = save.fleet.garages.find((item) => item.serviceId === vehicle.baseGarageId);
  let service: 'quick' | 'partial' | 'full' = vehicle.condition >= 35 ? 'quick' : vehicle.condition >= 20 ? 'partial' : 'full';
  let target = repairOutcome(vehicle, service);
  if (target.condition < DEFAULT_SHIFT_POLICY.minimumCondition) {
    service = service === 'quick' ? 'partial' : 'full';
    target = repairOutcome(vehicle, service);
  }
  if (target.condition < DEFAULT_SHIFT_POLICY.minimumCondition) {
    service = 'full';
    target = repairOutcome(vehicle, service);
  }
  const cost = workshopPrice(service, vehicle.condition, vehicle.maintenanceWear);
  const available = save.money;
  const workshopName = nearest?.gameName ?? garage?.name ?? 'Garagem da frota';
  const charge = new EconomyService(save).expense(
    cost,
    'repair',
    `Reparo pré-turno • ${workshopName}`,
    `${requestId}:repair`,
    false,
    fleetContext(save, vehicle.id, employee.id, 'pre-shift-repair')
  );
  if (!charge.applied) return {
    applied: false as const,
    reason: 'repair-insufficient' as const,
    requiredValue: cost,
    availableValue: available
  };
  const durationSeconds = Math.round(Math.max(60, Math.min(360,
    45 + (100 - vehicle.condition) * 2.1 + (service === 'full' ? 60 : service === 'partial' ? 25 : 0)
  )));
  return {
    applied: true as const,
    repair: {
      requestId: `${requestId}:repair`,
      workshopServiceId: nearest?.id ?? garage?.serviceId ?? 'fleet-garage',
      workshopName,
      workshopPosition: nearest?.stopPoint ? { ...nearest.stopPoint } : { ...vehicle.position },
      service,
      cost,
      chargedAt: now.toISOString(),
      durationSeconds,
      elapsedSeconds: 0,
      originalCondition: vehicle.condition,
      targetCondition: target.condition,
      completedAt: null
    }
  };
}

function repairOutcome(vehicle: FleetVehicle, service: 'quick' | 'partial' | 'full') {
  const collisionDamage = service === 'full' ? 0 : Math.max(0, vehicle.collisionDamage - (service === 'partial' ? 22 : 8));
  const maintenanceWear = service === 'full' ? 0 : Math.max(0, vehicle.maintenanceWear - (service === 'partial' ? 10 : 3));
  return { collisionDamage, maintenanceWear, condition: Math.max(0, 100 - collisionDamage - maintenanceWear * 0.45) };
}

function advancePreShiftRepair(shift: FleetShift, employee: FleetEmployee, vehicle: FleetVehicle, seconds: number) {
  const repair = shift.repair;
  if (!repair || repair.completedAt || seconds <= 0) return;
  repair.elapsedSeconds = Math.min(repair.durationSeconds, repair.elapsedSeconds + seconds);
  const progress = repair.elapsedSeconds / Math.max(1, repair.durationSeconds);
  const state = progress < 0.16 ? 'preparing-vehicle' : progress < 0.42 ? 'going-to-repair' : 'repairing';
  shift.state = state;
  employee.state = state;
  vehicle.state = 'maintenance';
  vehicle.simulationLevel = 'economic';
  if (progress < 1) return;
  const outcome = repairOutcome(vehicle, repair.service);
  vehicle.collisionDamage = outcome.collisionDamage;
  vehicle.maintenanceWear = outcome.maintenanceWear;
  vehicle.condition = outcome.condition;
  vehicle.position = { ...repair.workshopPosition };
  vehicle.state = 'employee-driving';
  vehicle.simulationLevel = 'detailed';
  vehicle.updatedAt = shift.lastSimulatedAt;
  vehicle.stateVersion += 1;
  repair.targetCondition = outcome.condition;
  repair.completedAt = shift.lastSimulatedAt;
  shift.state = 'starting-shift';
  employee.state = 'starting-shift';
}

export function startFleetShift(save: PlayerSave, employeeId: string, requestId: string, now = new Date(), serviceLocations: MapServiceLocation[] = []) {
  if (save.fleet.activeShift) return { applied: false, reason: 'shift-active' as const };
  const employee = save.fleet.employees.find((item) => item.id === employeeId);
  const vehicle = save.fleet.vehicles.find((item) => item.id === employee?.vehicleId);
  if (!employee || !vehicle) return { applied: false, reason: 'assignment' as const };
  const deliveryVehicle = ['Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200','Hatch Entrega'].includes(vehicle.model);
  const freightVehicle = ['Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú'].includes(vehicle.model);
  const commercialAuthorized = (deliveryVehicle && save.businesses.some((business) => business.kind === 'delivery'))
    || (freightVehicle && save.businesses.some((business) => business.kind === 'light-freight'));
  if (!vehicle.taxiLicensed && !commercialAuthorized) return { applied: false, reason: 'taxi-required' as const };
  if (vehicle.id === save.activeVehicleId) return { applied: false, reason: 'player-vehicle' as const };
  if (vehicle.fuel / vehicle.fuelCapacity * 100 < DEFAULT_SHIFT_POLICY.minimumFuelPercent) {
    return { applied: false, reason: 'vehicle-unfit' as const };
  }
  const startedAt = now.toISOString();
  const repairPlan = vehicle.condition < DEFAULT_SHIFT_POLICY.minimumCondition
    ? createPreShiftRepair(save, employee, vehicle, requestId, now, serviceLocations)
    : null;
  if (repairPlan && !repairPlan.applied) return repairPlan;
  const repair = repairPlan?.repair ?? null;
  const shift: FleetShift = {
    id: entityId('shift'), fleetId: save.fleet.id, ownerId: save.ownerId, employeeId, vehicleId: vehicle.id,
    state: repair ? 'preparing-vehicle' : 'starting-shift', simulationLevel: repair ? 'economic' : 'detailed', startedAt, lastSimulatedAt: startedAt,
    scheduledEndAt: new Date(now.getTime() + (DEFAULT_SHIFT_POLICY.durationMinutes * 60 + (repair?.durationSeconds ?? 0)) * 1_000).toISOString(),
    tripId: null, routeProgress: 0, repair, policy: {
      ...DEFAULT_SHIFT_POLICY,
      categories: [...DEFAULT_SHIFT_POLICY.categories],
      regional: { ...employee.regionalPreferences, allowedRegionIds: [...employee.regionalPreferences.allowedRegionIds] }
    },
    rides: 0, kilometers: 0, grossRevenue: 0, fuelCost: 0, commission: 0,
    maintenanceCost: repair?.cost ?? 0, fines: 0, netProfit: repair ? -repair.cost : 0,
    startedWorldMinute: save.worldClock.gameMinute, operatingSeconds: 0, trafficExposure: 0, passengerDemandExposure: 0
  };
  save.fleet.activeShift = shift;
  employee.state = shift.state;
  vehicle.state = repair ? 'maintenance' : 'employee-driving'; vehicle.simulationLevel = shift.simulationLevel;
  vehicle.leaseExpiresAt = shift.scheduledEndAt; vehicle.updatedAt = startedAt; vehicle.stateVersion += 1;
  return { applied: true, shift };
}

export function advanceFleetShift(
  save: PlayerSave,
  elapsedSeconds: number,
  offline = false,
  world = { trafficMultiplier: 0.7, passengerDemandBonus: 0 }
) {
  const shift = save.fleet.activeShift;
  if (!shift || elapsedSeconds <= 0 || !Number.isFinite(elapsedSeconds)) return { completedRides: 0, report: null as FleetReport | null };
  const employee = save.fleet.employees.find((item) => item.id === shift.employeeId);
  const vehicle = save.fleet.vehicles.find((item) => item.id === shift.vehicleId);
  if (!employee || !vehicle) return { completedRides: 0, report: endFleetShift(save, ['Contrato ou veículo indisponível.']) };

  const remainingShift = Math.max(0, (Date.parse(shift.scheduledEndAt) - Date.parse(shift.lastSimulatedAt)) / 1_000);
  const seconds = Math.max(0, Math.min(elapsedSeconds, remainingShift));
  const repairRemaining = shift.repair && !shift.repair.completedAt
    ? Math.max(0, shift.repair.durationSeconds - shift.repair.elapsedSeconds)
    : 0;
  const repairSeconds = Math.min(seconds, repairRemaining);
  if (repairSeconds > 0) {
    shift.lastSimulatedAt = new Date(Date.parse(shift.lastSimulatedAt) + repairSeconds * 1_000).toISOString();
    advancePreShiftRepair(shift, employee, vehicle, repairSeconds);
  }
  const operationSeconds = Math.max(0, seconds - repairSeconds);
  if (!operationSeconds) return { completedRides: 0, report: null as FleetReport | null };

  const trafficMultiplier = Math.max(0.4, Math.min(1, world.trafficMultiplier));
  const passengerDemandBonus = Math.max(0, Math.min(0.1, world.passengerDemandBonus));
  const travelTimeFactor = 0.85 + (trafficMultiplier - 0.4) * 0.5;
  const tripSeconds = Math.max(190, (430 - employee.efficiency * 1.45) / GAME_CONFIG.traffic.averageSpeedMultiplier);
  const totalProgress = shift.routeProgress + operationSeconds / travelTimeFactor;
  const completedRides = Math.floor(totalProgress / tripSeconds);
  shift.routeProgress = totalProgress % tripSeconds;
  shift.operatingSeconds = (shift.operatingSeconds ?? 0) + operationSeconds;
  shift.trafficExposure = (shift.trafficExposure ?? 0) + operationSeconds * trafficMultiplier;
  shift.passengerDemandExposure = (shift.passengerDemandExposure ?? 0) + operationSeconds * passengerDemandBonus;
  shift.lastSimulatedAt = new Date(Date.parse(shift.lastSimulatedAt) + operationSeconds * 1_000).toISOString();
  shift.state = fleetOperationalState(shift.routeProgress, tripSeconds);
  employee.state = shift.state;

  if (completedRides) {
    const averageDemandBonus = (shift.passengerDemandExposure ?? 0) / Math.max(1, shift.operatingSeconds ?? operationSeconds);
    settleFleetBatch(save, shift, employee, vehicle, completedRides, offline, averageDemandBonus);
  }
  const outOfFuel = vehicle.fuel <= 0.2;
  const maintenanceStop = vehicle.condition < shift.policy.minimumCondition;
  const scheduledEnd = Date.parse(shift.lastSimulatedAt) >= Date.parse(shift.scheduledEndAt) - 1;
  let report: FleetReport | null = null;
  const operatingNet = shift.netProfit + (shift.repair?.cost ?? 0);
  if (outOfFuel || maintenanceStop || scheduledEnd || (shift.policy.pauseOnLoss && operatingNet < -20)) {
    const occurrences = [
      ...(outOfFuel ? ['Turno encerrado por combustível insuficiente.'] : []),
      ...(maintenanceStop ? ['Turno encerrado para manutenção.'] : []),
      ...(scheduledEnd ? ['Duração planejada concluída.'] : []),
      ...(operatingNet < -20 ? ['Operação pausada para evitar prejuízo.'] : [])
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
  const world = averageWorldConditions(save.worldClock.gameMinute, first + reduced);
  const result = advanceFleetShift(save, first + reduced, true, world);
  save.worldClock.gameMinute = world.endGameMinute;
  save.worldClock.targetGameMinute = world.endGameMinute;
  save.worldClock.lastPeriod = periodAt(world.endGameMinute);
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
  const repairOccurrence = shift.repair
    ? [`Reparo pré-turno ${shift.repair.completedAt ? 'concluído' : 'interrompido'} em ${shift.repair.workshopName}: ${roundMoney(shift.repair.cost).toFixed(2)}.`]
    : [];
  const report = reportFromShift(shift, [...repairOccurrence, ...occurrences], unvalidatedClock);
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

function settleFleetBatch(save: PlayerSave, shift: FleetShift, employee: FleetEmployee, vehicle: FleetVehicle, rides: number, offline: boolean, demandBonus = 0) {
  const startRide = shift.rides;
  const distancePerRide = vehicle.model === 'Sedan 2012' ? 1.55 : 1.35;
  const grossPerRide = ECONOMY_CONFIG.fleet.grossBasePerRide
    + employee.service * ECONOMY_CONFIG.fleet.serviceFactor
    + employee.efficiency * ECONOMY_CONFIG.fleet.efficiencyFactor
    + (vehicle.model === 'Sedan 2012' ? ECONOMY_CONFIG.fleet.sedanBonus : 0);
  const gross = roundMoney(grossPerRide * rides * (1 + Math.max(0, Math.min(0.1, demandBonus))));
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
