import { GAME_CONFIG } from '../../config/gameConfig';
import type { DirectionalTrafficFlow, WorldClockSave, WorldClockSnapshot, WorldPeriodId } from '../../types/game';

const MINUTES_PER_DAY = 1_440;
const GAME_MINUTES_PER_REAL_MS = MINUTES_PER_DAY / (GAME_CONFIG.worldClock.realDayMinutes * 60_000);

const PERIOD_LABELS: Record<WorldPeriodId, string> = {
  madrugada: 'Madrugada',
  amanhecer: 'Amanhecer',
  'pico-manha': 'Pico da manhã',
  dia: 'Dia',
  'transicao-tarde': 'Transição da tarde',
  'pico-tarde': 'Pico da tarde',
  noite: 'Noite',
  'noite-avancada': 'Noite avançada'
};

export class WorldClock {
  private gameMinute: number;
  private targetGameMinute: number;
  private synchronized = false;
  private lastServerTimeMs: number | null;

  constructor(saved?: Partial<WorldClockSave>) {
    const fallback = sharedGameMinuteAt(Date.now());
    const elapsedSinceSaveMs = Number.isFinite(saved?.savedAtRealTimeMs)
      ? Math.max(0, Date.now() - saved!.savedAtRealTimeMs!)
      : 0;
    const elapsedGameMinutes = elapsedSinceSaveMs * GAME_MINUTES_PER_REAL_MS;
    this.gameMinute = normalizeMinute(finite(saved?.gameMinute, fallback) + elapsedGameMinutes);
    this.targetGameMinute = normalizeMinute(finite(saved?.targetGameMinute, this.gameMinute) + elapsedGameMinutes);
    this.lastServerTimeMs = Number.isFinite(saved?.lastServerTimeMs) ? saved!.lastServerTimeMs! : null;
  }

  update(rawDeltaMs: number) {
    const elapsedMs = Math.max(0, Math.min(rawDeltaMs, 6 * 60 * 60 * 1_000));
    const visibleMs = Math.min(250, elapsedMs);
    this.targetGameMinute = normalizeMinute(this.targetGameMinute + elapsedMs * GAME_MINUTES_PER_REAL_MS);
    const baseAdvance = visibleMs * GAME_MINUTES_PER_REAL_MS;
    const predictedMinute = normalizeMinute(this.gameMinute + baseAdvance);
    const correction = shortestMinuteDelta(predictedMinute, this.targetGameMinute);
    const maximumCorrection = GAME_CONFIG.worldClock.maximumVisualCorrectionGameMinutesPerSecond * visibleMs / 1_000;
    this.gameMinute = normalizeMinute(predictedMinute + clamp(correction, -maximumCorrection, maximumCorrection));
    return this.snapshot();
  }

  synchronize(serverTimeMs: number) {
    if (!Number.isFinite(serverTimeMs)) return;
    this.targetGameMinute = sharedGameMinuteAt(serverTimeMs);
    this.lastServerTimeMs = serverTimeMs;
    this.synchronized = true;
  }

  setGameMinuteForDevelopment(gameMinute: number) {
    if (!Number.isFinite(gameMinute)) return;
    this.gameMinute = normalizeMinute(gameMinute);
    this.targetGameMinute = this.gameMinute;
  }

  snapshot(): WorldClockSnapshot {
    return worldClockSnapshotAt(this.gameMinute, this.synchronized);
  }

  saveState(): WorldClockSave {
    const snapshot = this.snapshot();
    return {
      gameMinute: snapshot.gameMinute,
      targetGameMinute: this.targetGameMinute,
      savedAtRealTimeMs: Date.now(),
      lastServerTimeMs: this.lastServerTimeMs,
      lastPeriod: snapshot.period
    };
  }
}

export function sharedGameMinuteAt(serverTimeMs: number) {
  const elapsed = (serverTimeMs - GAME_CONFIG.worldClock.referenceEpochMs) * GAME_MINUTES_PER_REAL_MS;
  return normalizeMinute(GAME_CONFIG.worldClock.referenceGameMinute + elapsed);
}

export function worldClockSnapshotAt(gameMinute: number, synchronized = false): WorldClockSnapshot {
  const minute = normalizeMinute(gameMinute);
  const period = periodAt(minute);
  const visual = visualCycleAt(minute);
  return {
    gameMinute: minute,
    formattedTime: formatWorldTime(minute),
    period,
    periodLabel: PERIOD_LABELS[period],
    trafficMultiplier: trafficMultiplierAt(minute, period),
    passengerDemandBonus: period === 'pico-manha' || period === 'pico-tarde'
      ? GAME_CONFIG.worldClock.periods.picoManha.passengerDemandBonus
      : 0,
    directionalFlow: directionalFlowAt(period),
    ...visual,
    synchronized
  };
}

export function periodAt(gameMinute: number): WorldPeriodId {
  const minute = normalizeMinute(gameMinute);
  if (minute < 300) return 'madrugada';
  if (minute < 420) return 'amanhecer';
  if (minute < 540) return 'pico-manha';
  if (minute < 960) return 'dia';
  if (minute < 1_020) return 'transicao-tarde';
  if (minute < 1_140) return 'pico-tarde';
  if (minute < 1_320) return 'noite';
  return 'noite-avancada';
}

export function trafficMultiplierAt(gameMinute: number, period = periodAt(gameMinute)) {
  const minute = normalizeMinute(gameMinute);
  if (period === 'amanhecer') return lerp(0.4, 0.75, (minute - 300) / 120);
  if (period === 'transicao-tarde') return lerp(0.7, 0.85, (minute - 960) / 60);
  const config = GAME_CONFIG.worldClock.periods;
  return ({
    madrugada: config.madrugada.trafficMultiplier,
    'pico-manha': config.picoManha.trafficMultiplier,
    dia: config.dia.trafficMultiplier,
    'pico-tarde': config.picoTarde.trafficMultiplier,
    noite: config.noite.trafficMultiplier,
    'noite-avancada': config.noiteAvancada.trafficMultiplier
  } as Partial<Record<WorldPeriodId, number>>)[period] ?? 0.7;
}

export function averageWorldConditions(startGameMinute: number, realSeconds: number, samples = 24) {
  const durationGameMinutes = Math.max(0, realSeconds) * GAME_MINUTES_PER_REAL_MS * 1_000;
  const count = Math.max(1, Math.min(96, Math.floor(samples)));
  let traffic = 0;
  let demand = 0;
  for (let index = 0; index < count; index += 1) {
    const snapshot = worldClockSnapshotAt(startGameMinute + durationGameMinutes * (index + 0.5) / count);
    traffic += snapshot.trafficMultiplier;
    demand += snapshot.passengerDemandBonus;
  }
  return { trafficMultiplier: traffic / count, passengerDemandBonus: demand / count, endGameMinute: normalizeMinute(startGameMinute + durationGameMinutes) };
}

export function formatWorldTime(gameMinute: number) {
  const rounded = Math.floor(normalizeMinute(gameMinute));
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function directionalFlowAt(period: WorldPeriodId): DirectionalTrafficFlow {
  if (period === 'pico-manha') return 'toward-central';
  if (period === 'transicao-tarde' || period === 'pico-tarde') return 'toward-residential';
  return 'balanced';
}

function visualCycleAt(minute: number) {
  const hour = minute / 60;
  let daylight: number;
  if (hour < 5) daylight = 0.2;
  else if (hour < 7) daylight = lerp(0.2, 1, smooth((hour - 5) / 2));
  else if (hour < 16) daylight = 1;
  else if (hour < 19) daylight = lerp(1, 0.24, smooth((hour - 16) / 3));
  else if (hour < 22) daylight = lerp(0.24, 0.18, (hour - 19) / 3);
  else daylight = 0.18;
  const dawnWarmth = 1 - Math.min(1, Math.abs(hour - 6) / 1.5);
  const duskWarmth = 1 - Math.min(1, Math.abs(hour - 17.7) / 1.8);
  const warmth = Math.max(0, dawnWarmth, duskWarmth);
  const eveningLights = hour < 18 ? 0 : hour < 19 ? smooth(hour - 18) : 1;
  const morningLights = hour < 5 ? 1 : hour < 6.5 ? 1 - smooth((hour - 5) / 1.5) : 0;
  return {
    daylight,
    darkness: 1 - daylight,
    warmth,
    headlights: Math.max(eveningLights, morningLights)
  };
}

function normalizeMinute(value: number) { return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY; }
function shortestMinuteDelta(from: number, to: number) { return ((to - from + 720) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY - 720; }
function finite(value: unknown, fallback: number) { return Number.isFinite(value) ? Number(value) : fallback; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function lerp(from: number, to: number, progress: number) { return from + (to - from) * clamp(progress, 0, 1); }
function smooth(progress: number) { const value = clamp(progress, 0, 1); return value * value * (3 - 2 * value); }
