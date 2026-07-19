import { beforeEach, describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import { createNewSave, loadSave, migrateSave, writeSave } from './saveService';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

describe('save local versionado', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  });

  it('migra o save v1 preservando progresso e preenchendo novas preferências', () => {
    const migrated = migrateSave({
      saveVersion: 1,
      revision: 7,
      money: 432,
      fuel: 12,
      condition: 64,
      xp: 80,
      rating: 4.8,
      completedRides: 3,
      position: { x: 10, y: 20 },
      rotation: 1.2,
      settings: { quality: 'high', cameraMode: 'fixed', audio: true }
    });
    expect(migrated.saveVersion).toBe(GAME_CONFIG.saveVersion);
    expect(migrated.money).toBe(432);
    expect(migrated.completedRides).toBe(3);
    expect(migrated.settings.cameraZoom).toBe('normal');
    expect(migrated.settings.trafficDensity).toBe('automatic');
    expect(migrated.ledger).toEqual([]);
    expect(migrated.upgrades.engine).toBe(0);
    expect(migrated.collisionDamage).toBe(36);
    expect(migrated.maintenanceWear).toBe(0);
    expect(migrated.goals.firstRide).toBe(false);
    expect(migrated.mapVersion).toBe('brasilia-0.8.6');
    expect(migrated.fleet.garages[0]).toMatchObject({ serviceId: 'garage-shs-hatch', purchasePrice: 0, vehicleCapacity: 5, employeeCapacity: 5 });
    expect(migrated.publicPlayerId).toMatch(/^rbp_/);
    expect(migrated.onlinePreference).toBe('online');
    expect(migrated.settings.showPlayerNames).toBe(true);
    expect(migrated.currentChunk).toBe('0_0');
    expect(migrated.lastSafePosition).toEqual({ x: 10, y: 20 });
    expect(migrated.preferredRegionId).toBe('any');
    expect(migrated.currentRegionId).toBe('centro');
    expect(migrated.regionalFamiliarity).toEqual({});
    expect(migrated.favoriteServiceIds).toEqual([]);
    expect(migrated.cloudLineageId).toMatch(/^rbl_/);
    expect(migrated.autopilotSportMode).toBe(false);
  });

  it('preserva a preferência do Modo Sport ao salvar e migrar', () => {
    const save = createNewSave();
    save.autopilotSportMode = true;
    expect(migrateSave(save).autopilotSportMode).toBe(true);
    expect(migrateSave({ ...save, autopilotSportMode: undefined }).autopilotSportMode).toBe(false);
  });

  it('migra funcionário antigo com política regional idempotente', () => {
    const original = createNewSave();
    original.fleet.employees.push({
      id: 'legacy-driver', fleetId: original.fleet.id, ownerId: original.ownerId,
      name: 'Motorista Legado', avatar: 'ML', driving: 70, safety: 75, service: 80,
      efficiency: 72, commissionPercent: 22, hireCost: 100, description: 'Legado',
      state: 'waiting-vehicle', vehicleId: null, hiredAt: original.updatedAt,
      grossRevenue: 0, commissionPaid: 0, tripsCompleted: 0
    } as never);
    const migrated = migrateSave({ ...original, saveVersion: 6 });
    expect(migrated.fleet.employees[0].regionalPreferences).toMatchObject({
      preferredRegionId: 'any', maximumDistanceKm: 18, acceptLongTrips: true
    });
    expect(migrateSave(migrated)).toEqual(migrated);
  });

  it('preserva ledger, melhorias e progressão do save v3 sem aceitar valores inválidos', () => {
    const migrated = migrateSave({
      ...createNewSave(),
      money: Number.NaN,
      debts: 25,
      upgrades: { engine: 2, brakes: 9, tires: 0, suspension: 0, economy: 1, comfort: 0 },
      totalKm: 18.4,
      driverLevel: 4
    });
    expect(migrated.money).toBe(100);
    expect(migrated.debts).toBe(25);
    expect(migrated.upgrades.engine).toBe(2);
    expect(migrated.upgrades.brakes).toBe(3);
    expect(migrated.totalKm).toBe(18.4);
  });

  it('mantém backup válido e recupera sem apagar o conteúdo corrompido', () => {
    const original = createNewSave({ x: 15, y: 30 });
    localStorage.setItem(GAME_CONFIG.storage.key, JSON.stringify(original));
    const updated = writeSave({ ...original, money: 999 });
    expect(updated.money).toBe(999);
    localStorage.setItem(GAME_CONFIG.storage.key, '{save quebrado');
    const recovered = loadSave();
    expect(recovered.position).toEqual({ x: 15, y: 30 });
    expect(localStorage.getItem(GAME_CONFIG.storage.key)).toBe('{save quebrado');
    expect(localStorage.getItem(GAME_CONFIG.storage.corruptKey)).toBe('{save quebrado');
  });

  it('guarda o conteúdo original antes de migrar um save antigo', () => {
    const legacy = JSON.stringify({ ...createNewSave(), saveVersion: 2, money: 321 });
    localStorage.setItem(GAME_CONFIG.storage.key, legacy);

    const migrated = loadSave();

    expect(migrated.saveVersion).toBe(GAME_CONFIG.saveVersion);
    expect(migrated.money).toBe(321);
    expect(localStorage.getItem(GAME_CONFIG.storage.backupKey)).toBe(legacy);
  });
});
