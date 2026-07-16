import { describe, expect, it } from 'vitest';
import { createNewSave } from '../../services/storage/saveService';
import { canRegularize, convertActiveVehicleToTaxi, regularizeTaxi } from './RegularizationService';

function eligibleSave() {
  const save = createNewSave({ x: 12, y: 34 });
  save.money = 2_000; save.completedRides = 15; save.xp = 540; save.rating = 4.6; save.totalKm = 22;
  save.upgrades.engine = 2; save.fuel = 17; save.condition = 73; save.collisionDamage = 20; save.maintenanceWear = 15;
  save.fleet.vehicles[0].upgrades.engine = 2;
  return save;
}

describe('regularização e conversão', () => {
  it('cobra uma vez e libera o status profissional', () => {
    const save = eligibleSave();
    expect(canRegularize(save)).toBe(true);
    const first = regularizeTaxi(save, 'regularize-once');
    const balance = save.money;
    const second = regularizeTaxi(save, 'regularize-once');
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(save.money).toBe(balance);
    expect(save.professionalStatus).toBe('licensed-taxi');
    expect(save.ledger.filter((entry) => entry.idempotencyKey === 'regularize-once')).toHaveLength(1);
  });

  it('converte a mesma instância do Hatch preservando progresso e histórico', () => {
    const save = eligibleSave();
    regularizeTaxi(save, 'regularize');
    const vehicle = save.fleet.vehicles[0];
    const id = vehicle.id;
    const result = convertActiveVehicleToTaxi(save, 'convert');
    expect(result.applied).toBe(true);
    expect(save.fleet.vehicles[0]).toBe(vehicle);
    expect(vehicle.id).toBe(id);
    expect(vehicle.upgrades.engine).toBe(2);
    expect(vehicle.taxiLicensed).toBe(true);
    expect(save.fleet.vehicles).toHaveLength(1);
  });
});
