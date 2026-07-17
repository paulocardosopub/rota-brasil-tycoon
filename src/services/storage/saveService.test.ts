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
    expect(migrated.saveVersion).toBe(5);
    expect(migrated.money).toBe(432);
    expect(migrated.completedRides).toBe(3);
    expect(migrated.settings.cameraZoom).toBe('normal');
    expect(migrated.settings.trafficDensity).toBe('automatic');
    expect(migrated.ledger).toEqual([]);
    expect(migrated.upgrades.engine).toBe(0);
    expect(migrated.collisionDamage).toBe(36);
    expect(migrated.maintenanceWear).toBe(0);
    expect(migrated.goals.firstRide).toBe(false);
    expect(migrated.mapVersion).toBe('brasilia-0.7.0');
    expect(migrated.currentChunk).toBe('0_0');
    expect(migrated.lastSafePosition).toEqual({ x: 10, y: 20 });
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

    expect(migrated.saveVersion).toBe(5);
    expect(migrated.money).toBe(321);
    expect(localStorage.getItem(GAME_CONFIG.storage.backupKey)).toBe(legacy);
  });
});
