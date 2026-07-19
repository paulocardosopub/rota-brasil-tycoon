import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import { createNewSave, migrateSave } from '../../services/storage/saveService';
import { regularizeTaxi } from '../progression/RegularizationService';
import type { MapServiceLocation } from '../../types/game';
import { advanceFleetShift, assignEmployee, availableCandidates, fleetOperationalState, fleetSimulationLevel, hireEmployee, purchaseBusiness, purchaseLightVehicle, purchaseSecondVehicle, simulateOfflineReturn, startFleetShift, trainEmployee, transferFleetEntity, updateEmployeeRegionalPreferences } from './FleetService';

function fleetReady() {
  const save = createNewSave();
  save.money = 5_000; save.completedRides = 20; save.xp = 1_000; save.rating = 4.8; save.totalKm = 30;
  regularizeTaxi(save, 'regularize-fleet');
  hireEmployee(save, 'bia-rocha', 'hire-bia');
  purchaseSecondVehicle(save, 'buy-sedan');
  const employee = save.fleet.employees[0];
  const sedan = save.fleet.vehicles.find((vehicle) => vehicle.model === 'Sedan 2012')!;
  assignEmployee(save, employee.id, sedan.id);
  return { save, employee, sedan };
}

describe('primeira frota', () => {
  it('expõe cinco modelos para passageiros, cinco para entregas e cinco para frete', () => {
    expect(['Hatch 1998','Sedan 2012', ...Object.keys(GAME_CONFIG.fleet.passengerVehiclePrices)]).toHaveLength(5);
    expect(Object.keys(GAME_CONFIG.fleet.vehiclePrices).slice(0, 5)).toHaveLength(5);
    expect(Object.keys(GAME_CONFIG.fleet.vehiclePrices).slice(5, 10)).toHaveLength(5);
    expect(Object.keys(GAME_CONFIG.fleet.vehiclePrices).slice(10)).toEqual(['Micro-ônibus Urbano','Ônibus Urbano Convencional']);
  });
  it('oferece oito candidatos e permite preencher os cinco postos da garagem', () => {
    const save = createNewSave();
    save.money = 10_000; save.completedRides = 20; save.xp = 1_000; save.rating = 4.8; save.totalKm = 30;
    regularizeTaxi(save, 'regularize-team');
    expect(availableCandidates(save)).toHaveLength(8);
    for (const candidate of availableCandidates(save, 5)) expect(hireEmployee(save, candidate.id, `hire-${candidate.id}`).applied).toBe(true);
    expect(save.fleet.employees).toHaveLength(5);
    expect(hireEmployee(save, availableCandidates(save, 1)[0].id, 'hire-over-capacity').applied).toBe(false);
  });

  it('compra empresas, treina funcionário e registra os dez modelos comerciais', () => {
    const save = createNewSave();
    save.money = 50_000; save.completedRides = 20; save.xp = 1_000; save.rating = 4.8; save.totalKm = 30;
    regularizeTaxi(save, 'regularize-business');
    const garage = { id: 'garage-shs-hatch', category: 'garage', gameName: 'Garagem', stopPoint: { x: 0, y: 0 }, regionId: 'sudoeste' } as MapServiceLocation;
    expect(purchaseBusiness(save, 'delivery', garage.id, 'business-delivery').applied).toBe(true);
    expect(purchaseBusiness(save, 'delivery', garage.id, 'business-delivery-repeat').applied).toBe(false);
    expect(purchaseBusiness(save, 'light-freight', garage.id, 'business-freight').applied).toBe(true);
    expect(hireEmployee(save, 'bia-rocha', 'hire-commercial').applied).toBe(true);
    const employee = save.fleet.employees.find((item) => item.id === 'bia-rocha')!;
    expect(trainEmployee(save, employee.id, 'MOTORCYCLE', 'training-moto').applied).toBe(true);
    const models = ['Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200'] as const;
    for (const model of models) expect(purchaseLightVehicle(save, model, garage, `buy-${model}`).applied).toBe(true);
    expect(purchaseLightVehicle(save, 'Hatch Entrega', garage, 'garage-capacity').applied).toBe(false);
    const moto = save.fleet.vehicles.find((vehicle) => vehicle.model === 'Moto Urbana 125')!;
    expect(assignEmployee(save, employee.id, moto.id).applied).toBe(true);
    expect(startFleetShift(save, employee.id, 'delivery-shift').applied).toBe(true);
  });
  it('exige empresa, base compatível e qualificação BUS', () => {
    const save = createNewSave();
    save.money = 80_000; save.completedRides = 20; save.xp = 1_000; save.rating = 4.8; save.totalKm = 30;
    regularizeTaxi(save, 'regularize-bus');
    const garage = { id: 'garage-shs-hatch', category: 'garage', gameName: 'Garagem', stopPoint: { x: 0, y: 0 }, regionId: 'sudoeste' } as MapServiceLocation;
    purchaseBusiness(save, 'delivery', garage.id, 'bus-delivery');
    purchaseBusiness(save, 'light-freight', garage.id, 'bus-freight');
    expect(purchaseBusiness(save, 'bus', garage.id, 'bus-company').applied).toBe(true);
    expect(purchaseLightVehicle(save, 'Micro-ônibus Urbano', garage, 'bus-micro').applied).toBe(true);
    hireEmployee(save, 'bia-rocha', 'bus-driver');
    const employee = save.fleet.employees[0];
    const micro = save.fleet.vehicles.find((vehicle) => vehicle.model === 'Micro-ônibus Urbano')!;
    expect(assignEmployee(save, employee.id, micro.id).applied).toBe(false);
    expect(trainEmployee(save, employee.id, 'BUS', 'bus-training').applied).toBe(true);
    expect(assignEmployee(save, employee.id, micro.id).applied).toBe(true);
  });
  it('impede veículo e motorista duplicados', () => {
    const { save, employee, sedan } = fleetReady();
    expect(assignEmployee(save, employee.id, sedan.id).applied).toBe(false);
    expect(hireEmployee(save, 'bia-rocha', 'hire-again').applied).toBe(false);
    expect(purchaseSecondVehicle(save, 'sedan-3').applied).toBe(true);
    expect(purchaseSecondVehicle(save, 'sedan-4').applied).toBe(true);
    expect(purchaseSecondVehicle(save, 'sedan-5').applied).toBe(true);
    expect(purchaseSecondVehicle(save, 'sedan-6').applied).toBe(false);
  });

  it('opera turno com receita, custos, comissão e contexto completo no ledger', () => {
    const { save, employee, sedan } = fleetReady();
    expect(startFleetShift(save, employee.id, 'shift').applied).toBe(true);
    const result = advanceFleetShift(save, 3_600);
    expect(result.completedRides).toBeGreaterThan(0);
    expect(save.fleet.activeShift?.netProfit).toBeGreaterThan(0);
    expect(sedan.fuel).toBeLessThan(26);
    const fleetEntries = save.ledger.filter((entry) => entry.fleetId === save.fleet.id);
    expect(fleetEntries.some((entry) => entry.category === 'commission')).toBe(true);
    expect(fleetEntries.every((entry) => entry.ownerId && entry.vehicleId && entry.driverId && entry.tripId)).toBe(true);
  });

  it('pondera proporcionalmente trânsito e demanda atravessados pelo funcionário', () => {
    const { save, employee } = fleetReady();
    expect(startFleetShift(save, employee.id, 'shift-world-time').applied).toBe(true);
    advanceFleetShift(save, 1_800, false, { trafficMultiplier: 0.7, passengerDemandBonus: 0 });
    advanceFleetShift(save, 1_800, false, { trafficMultiplier: 1, passengerDemandBonus: 0.1 });
    const shift = save.fleet.activeShift!;
    expect(shift.operatingSeconds).toBe(3_600);
    expect((shift.trafficExposure ?? 0) / shift.operatingSeconds!).toBeCloseTo(0.85, 5);
    expect((shift.passengerDemandExposure ?? 0) / shift.operatingSeconds!).toBeCloseTo(0.05, 5);
    expect(shift.startedWorldMinute).toBe(save.worldClock.gameMinute);
    expect(shift.rides).toBeGreaterThan(0);
  });

  it('repara automaticamente antes do turno sem gerar lucro durante o reparo', () => {
    const { save, employee, sedan } = fleetReady();
    sedan.condition = 30;
    sedan.collisionDamage = 55;
    sedan.maintenanceWear = 20;
    const workshop = {
      id: 'workshop-test', category: 'workshop', gameName: 'Oficina Teste',
      stopPoint: { x: 120, y: 80 }, regionId: 'centro'
    } as MapServiceLocation;
    const balanceBefore = save.money;

    const started = startFleetShift(save, employee.id, 'damaged-shift', new Date('2026-07-18T12:00:00.000Z'), [workshop]);
    expect(started.applied).toBe(true);
    const repair = save.fleet.activeShift!.repair!;
    expect(repair.workshopServiceId).toBe(workshop.id);
    expect(save.money).toBe(balanceBefore - repair.cost);
    expect(save.fleet.activeShift).toMatchObject({ rides: 0, grossRevenue: 0, netProfit: -repair.cost });
    expect(sedan.state).toBe('maintenance');

    const repairing = advanceFleetShift(save, repair.durationSeconds / 2);
    expect(repairing.completedRides).toBe(0);
    expect(save.fleet.activeShift).toMatchObject({ rides: 0, grossRevenue: 0, netProfit: -repair.cost });
    expect(save.fleet.activeShift?.repair?.completedAt).toBeNull();

    advanceFleetShift(save, repair.durationSeconds / 2);
    expect(save.fleet.activeShift?.repair?.completedAt).not.toBeNull();
    expect(sedan.condition).toBeGreaterThanOrEqual(45);
    expect(sedan.position).toEqual(workshop.stopPoint);
    const duplicate = startFleetShift(save, employee.id, 'damaged-shift', new Date('2026-07-18T12:10:00.000Z'), [workshop]);
    expect(duplicate.applied).toBe(false);
    expect(save.ledger.filter((entry) => entry.idempotencyKey === 'damaged-shift:repair')).toHaveLength(1);
  });

  it('informa o valor exato quando falta saldo para o reparo obrigatório', () => {
    const { save, employee, sedan } = fleetReady();
    sedan.condition = 15;
    sedan.collisionDamage = 80;
    sedan.maintenanceWear = 12;
    save.money = 1;
    const result = startFleetShift(save, employee.id, 'repair-no-money');
    expect(result).toMatchObject({ applied: false, reason: 'repair-insufficient', availableValue: 1 });
    expect('requiredValue' in result && result.requiredValue).toBeGreaterThan(1);
    expect(save.fleet.activeShift).toBeNull();
    expect(save.ledger.some((entry) => entry.idempotencyKey === 'repair-no-money:repair')).toBe(false);
  });

  it('preserva o reparo ao recarregar, conclui offline e bloqueia transferência', () => {
    const { save, employee, sedan } = fleetReady();
    sedan.condition = 28;
    sedan.collisionDamage = 60;
    sedan.maintenanceWear = 18;
    save.fleet.garages.push({ ...save.fleet.garages[0], serviceId: 'garage-second', name: 'Segunda garagem' });
    expect(startFleetShift(save, employee.id, 'repair-reload').applied).toBe(true);
    expect(transferFleetEntity(save, 'vehicle', sedan.id, 'garage-second', 'locked-transfer').applied).toBe(false);

    const reloaded = migrateSave(JSON.parse(JSON.stringify(save)));
    const duration = reloaded.fleet.activeShift!.repair!.durationSeconds;
    const result = advanceFleetShift(reloaded, duration + 3_600, true);
    expect(reloaded.fleet.activeShift?.repair?.completedAt).not.toBeNull();
    expect(result.completedRides).toBeGreaterThan(0);
    expect(reloaded.fleet.activeShift?.grossRevenue).toBeGreaterThan(0);
  });

  it('limita o retorno offline a oito horas com eficiência reduzida', () => {
    const { save, employee } = fleetReady();
    const now = new Date('2026-07-16T18:00:00.000Z');
    const start = new Date('2026-07-16T06:00:00.000Z');
    startFleetShift(save, employee.id, 'shift-offline', start);
    save.fleet.activeShift!.scheduledEndAt = '2026-07-17T06:00:00.000Z';
    save.clockGuard.lastSeenAt = start.toISOString();
    const report = simulateOfflineReturn(save, now);
    expect(report).not.toBeNull();
    expect(report!.elapsedMinutes).toBeLessThanOrEqual(396);
    expect(report!.unvalidatedClock).toBe(true);
  });

  it('bloqueia ganho quando o relógio local recua', () => {
    const { save, employee } = fleetReady();
    startFleetShift(save, employee.id, 'shift-clock', new Date('2026-07-16T12:00:00.000Z'));
    save.clockGuard.lastSeenAt = '2026-07-16T13:00:00.000Z';
    const report = simulateOfflineReturn(save, new Date('2026-07-16T11:00:00.000Z'));
    expect(save.clockGuard.rollbackDetected).toBe(true);
    expect(report?.netProfit).toBe(0);
  });

  it('seleciona camadas por distância', () => {
    expect(fleetSimulationLevel(100)).toBe('detailed');
    expect(fleetSimulationLevel(900)).toBe('simplified');
    expect(fleetSimulationLevel(2_000)).toBe('economic');
  });

  it('alterna busca e passageiro conforme o progresso da rota simulada', () => {
    expect(fleetOperationalState(20, 300)).toBe('seeking-trip');
    expect(fleetOperationalState(150, 300)).toBe('with-passenger');
    expect(fleetOperationalState(0, 0)).toBe('seeking-trip');
  });

  it('preserva a política regional no turno e bloqueia alteração durante a operação', () => {
    const { save, employee } = fleetReady();
    expect(updateEmployeeRegionalPreferences(save, employee.id, {
      preferredRegionId: 'lago-sul',
      allowedRegionIds: ['lago-sul', 'jardim-botanico'],
      maximumDistanceKm: 12,
      acceptLongTrips: false
    }).applied).toBe(true);
    expect(startFleetShift(save, employee.id, 'regional-shift').applied).toBe(true);
    expect(save.fleet.activeShift?.policy.regional).toMatchObject({
      preferredRegionId: 'lago-sul',
      allowedRegionIds: ['lago-sul', 'jardim-botanico'],
      maximumDistanceKm: 12,
      acceptLongTrips: false
    });
    expect(updateEmployeeRegionalPreferences(save, employee.id, { maximumDistanceKm: 25 }).applied).toBe(false);
  });
});
