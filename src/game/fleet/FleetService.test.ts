import { describe, expect, it } from 'vitest';
import { createNewSave } from '../../services/storage/saveService';
import { regularizeTaxi } from '../progression/RegularizationService';
import { advanceFleetShift, assignEmployee, fleetSimulationLevel, hireEmployee, purchaseSecondVehicle, simulateOfflineReturn, startFleetShift } from './FleetService';

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
  it('impede veículo e motorista duplicados', () => {
    const { save, employee, sedan } = fleetReady();
    expect(assignEmployee(save, employee.id, sedan.id).applied).toBe(false);
    expect(hireEmployee(save, 'bia-rocha', 'hire-again').applied).toBe(false);
    expect(purchaseSecondVehicle(save, 'sedan-again').applied).toBe(false);
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
});
