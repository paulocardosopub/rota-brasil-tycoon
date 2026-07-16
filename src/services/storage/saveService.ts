import { GAME_CONFIG } from '../../config/gameConfig';
import type { PlayerSave } from '../../types/game';

export function createNewSave(position = { x: 0, y: 0 }): PlayerSave {
  return {
    saveVersion: GAME_CONFIG.saveVersion,
    revision: 1,
    updatedAt: new Date().toISOString(),
    ...GAME_CONFIG.initialPlayer,
    position,
    rotation: 0,
    settings: { quality: 'automatic', cameraMode: 'follow', audio: true }
  };
}

export function migrateSave(input: unknown): PlayerSave {
  if (!input || typeof input !== 'object') return createNewSave();
  const raw = input as Partial<PlayerSave>;
  const fresh = createNewSave(raw.position);
  return {
    ...fresh,
    ...raw,
    saveVersion: GAME_CONFIG.saveVersion,
    revision: Number.isFinite(raw.revision) ? Math.max(1, raw.revision!) : 1,
    money: Number.isFinite(raw.money) ? raw.money! : fresh.money,
    fuel: Number.isFinite(raw.fuel) ? Math.max(0, Math.min(40, raw.fuel!)) : fresh.fuel,
    condition: Number.isFinite(raw.condition) ? Math.max(0, Math.min(100, raw.condition!)) : fresh.condition,
    position: raw.position && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.y) ? raw.position : fresh.position,
    settings: { ...fresh.settings, ...(raw.settings ?? {}) }
  };
}

export function loadSave(): PlayerSave {
  try {
    const stored = localStorage.getItem(GAME_CONFIG.storage.key);
    return stored ? migrateSave(JSON.parse(stored)) : createNewSave();
  } catch {
    localStorage.removeItem(GAME_CONFIG.storage.key);
    return createNewSave();
  }
}

export function writeSave(save: PlayerSave) {
  const updated: PlayerSave = {
    ...save,
    revision: save.revision + 1,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(GAME_CONFIG.storage.key, JSON.stringify(updated));
  return updated;
}

export function deleteSave() {
  localStorage.removeItem(GAME_CONFIG.storage.key);
}

export function hasSave() {
  return Boolean(localStorage.getItem(GAME_CONFIG.storage.key));
}
