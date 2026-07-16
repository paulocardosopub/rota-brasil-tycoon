import { GAME_CONFIG } from '../../config/gameConfig';
import type { CameraZoom, PlayerSave, PlayerSettings, Quality, TrafficDensity } from '../../types/game';

const DEFAULT_SETTINGS: PlayerSettings = {
  quality: 'automatic',
  cameraMode: 'follow',
  audio: true,
  masterVolume: 0.7,
  engineVolume: 0.55,
  effectsVolume: 0.75,
  cameraShake: true,
  cameraZoom: 'normal',
  trafficDensity: 'automatic'
};

export function createNewSave(position = { x: 0, y: 0 }): PlayerSave {
  return {
    saveVersion: GAME_CONFIG.saveVersion,
    revision: 1,
    updatedAt: new Date().toISOString(),
    ...GAME_CONFIG.initialPlayer,
    position,
    rotation: 0,
    settings: { ...DEFAULT_SETTINGS },
    activeMission: null,
    autopilotEnabled: false
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
    settings: migrateSettings(raw.settings),
    activeMission: validMission(raw.activeMission) ? raw.activeMission : null,
    autopilotEnabled: raw.autopilotEnabled === true
  };
}

export function loadSave(): PlayerSave {
  const stored = localStorage.getItem(GAME_CONFIG.storage.key);
  if (!stored) return loadBackup() ?? createNewSave();
  try {
    return migrateSave(JSON.parse(stored));
  } catch {
    // Mantém o dado original intacto para diagnóstico e recuperação manual.
    localStorage.setItem(GAME_CONFIG.storage.corruptKey, stored);
    return loadBackup() ?? createNewSave();
  }
}

export function writeSave(save: PlayerSave) {
  const updated: PlayerSave = {
    ...save,
    revision: save.revision + 1,
    updatedAt: new Date().toISOString()
  };
  const current = localStorage.getItem(GAME_CONFIG.storage.key);
  if (current) {
    try {
      JSON.parse(current);
      localStorage.setItem(GAME_CONFIG.storage.backupKey, current);
    } catch {
      localStorage.setItem(GAME_CONFIG.storage.corruptKey, current);
    }
  }
  localStorage.setItem(GAME_CONFIG.storage.key, JSON.stringify(updated));
  return updated;
}

export function deleteSave() {
  localStorage.removeItem(GAME_CONFIG.storage.key);
  localStorage.removeItem(GAME_CONFIG.storage.backupKey);
  localStorage.removeItem(GAME_CONFIG.storage.corruptKey);
}

function loadBackup() {
  const backup = localStorage.getItem(GAME_CONFIG.storage.backupKey);
  if (!backup) return null;
  try {
    return migrateSave(JSON.parse(backup));
  } catch {
    return null;
  }
}

function migrateSettings(input: Partial<PlayerSettings> | undefined): PlayerSettings {
  return {
    quality: validChoice(input?.quality, ['automatic', 'low', 'medium', 'high']) as Quality ?? DEFAULT_SETTINGS.quality,
    cameraMode: validChoice(input?.cameraMode, ['follow', 'fixed']) ?? DEFAULT_SETTINGS.cameraMode,
    audio: input?.audio !== false,
    masterVolume: volume(input?.masterVolume, DEFAULT_SETTINGS.masterVolume),
    engineVolume: volume(input?.engineVolume, DEFAULT_SETTINGS.engineVolume),
    effectsVolume: volume(input?.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    cameraShake: input?.cameraShake !== false,
    cameraZoom: validChoice(input?.cameraZoom, ['near', 'normal', 'far']) as CameraZoom ?? DEFAULT_SETTINGS.cameraZoom,
    trafficDensity: validChoice(input?.trafficDensity, ['automatic', 'low', 'medium', 'high']) as TrafficDensity ?? DEFAULT_SETTINGS.trafficDensity
  };
}

function validChoice<T extends string>(value: unknown, options: readonly T[]) {
  return typeof value === 'string' && options.includes(value as T) ? value as T : undefined;
}

function volume(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : fallback;
}

function validMission(value: PlayerSave['activeMission'] | undefined): value is NonNullable<PlayerSave['activeMission']> {
  if (!value || typeof value !== 'object') return false;
  if (!['pickup', 'passenger-on-board'].includes(value.phase)) return false;
  return [value.pickup.x, value.pickup.y, value.destination.x, value.destination.y].every(Number.isFinite);
}

export function hasSave() {
  return Boolean(localStorage.getItem(GAME_CONFIG.storage.key));
}
