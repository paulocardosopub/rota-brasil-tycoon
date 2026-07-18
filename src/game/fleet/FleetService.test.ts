import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import { createNewSave } from '../../services/storage/saveService';
import { regularizeTaxi } from '../progression/RegularizationService';
import type { MapServiceLocation } from '../../types/game';
import { advanceFleetShift, assignEmployee, availableCandidates, fleetOperationalState, fleetSimulationLevel, hireEmployee, purchaseBusiness, purchaseLightVehicle, purchaseSecondVehicle, simulateOfflineReturn, startFleetShift, trainEmployee, updateEmployeeRegionalPreferences } from './FleetService';

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
