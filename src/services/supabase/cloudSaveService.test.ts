import { describe, expect, it } from 'vitest';
import { createNewSave } from '../storage/saveService';
import { savesDiverged } from './cloudSaveService';

describe('linhagem do save em nuvem', () => {
  it('não cria conflito quando apenas a nuvem avançou', () => {
    const local = createNewSave();
    local.completedRides = 1;
    local.revision = 4;
    local.lastCloudRevision = 4;
    const remote = structuredClone(local);
    remote.revision = 5;
    remote.money += 20;
    expect(savesDiverged(local, remote)).toBe(false);
  });

  it('não cria conflito quando apenas o dispositivo avançou', () => {
    const remote = createNewSave();
    remote.completedRides = 1;
    remote.revision = 4;
    remote.lastCloudRevision = 4;
    const local = structuredClone(remote);
    local.revision = 5;
    local.money += 20;
    expect(savesDiverged(local, remote)).toBe(false);
  });

  it('detecta duas alterações concorrentes mesmo com a mesma revisão', () => {
    const base = createNewSave();
    base.completedRides = 1;
    base.revision = 4;
    base.lastCloudRevision = 4;
    const local = { ...structuredClone(base), revision: 5, money: 140 };
    const remote = { ...structuredClone(base), revision: 5, money: 90 };
    expect(savesDiverged(local, remote)).toBe(true);
  });

  it('impede unir patrimônios de linhagens diferentes', () => {
    const local = createNewSave();
    local.completedRides = 2;
    const remote = structuredClone(local);
    remote.cloudLineageId = 'save-outra-linhagem';
    expect(savesDiverged(local, remote)).toBe(true);
  });
});
