import { GAME_CONFIG } from '../../config/gameConfig';
import type { RideCategory, TaxiMeterSnapshot } from '../../types/game';
import { roundMoney } from '../economy/TransactionLedger';

export function createTaxiMeter(): TaxiMeterSnapshot {
  return {
    state: 'free', tripId: null, currentFare: 0, distanceMeters: 0, elapsedSeconds: 0,
    waitingSeconds: 0, demandMultiplier: 1, category: 'popular', destinationLabel: '',
    startedAt: null, finishedAt: null
  };
}

export function prepareTaxiMeter(meter: TaxiMeterSnapshot, tripId: string, destinationLabel: string, category: RideCategory, demandMultiplier = 1) {
  Object.assign(meter, createTaxiMeter(), {
    state: 'en-route', tripId, destinationLabel, category,
    demandMultiplier: clamp(demandMultiplier, 0.9, 1.2)
  } satisfies Partial<TaxiMeterSnapshot>);
  return meter;
}

export function markTaxiBoarding(meter: TaxiMeterSnapshot) {
  if (meter.state === 'en-route') meter.state = 'boarding';
  return meter;
}

export function startTaxiMeter(meter: TaxiMeterSnapshot, now = new Date().toISOString()) {
  if (!meter.tripId || !['en-route', 'boarding'].includes(meter.state)) return false;
  meter.state = 'occupied';
  meter.startedAt ??= now;
  meter.currentFare = calculateMeterFare(meter);
  return true;
}

export function updateTaxiMeter(meter: TaxiMeterSnapshot, distanceMeters: number, deltaSeconds: number, speedKmh: number) {
  if (!['occupied', 'waiting'].includes(meter.state) || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return meter.currentFare;
  const safeDistance = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0);
  const safeDelta = Math.min(0.25, deltaSeconds);
  meter.distanceMeters += safeDistance;
  meter.elapsedSeconds += safeDelta;
  if (speedKmh < 1 && safeDistance < 0.2) {
    meter.waitingSeconds += safeDelta;
    meter.state = 'waiting';
  } else meter.state = 'occupied';
  meter.currentFare = calculateMeterFare(meter);
  return meter.currentFare;
}

export function finishTaxiMeter(meter: TaxiMeterSnapshot, now = new Date().toISOString()) {
  if (!['occupied', 'waiting'].includes(meter.state)) return meter.currentFare;
  meter.currentFare = calculateMeterFare(meter);
  meter.state = 'finished';
  meter.finishedAt = now;
  return meter.currentFare;
}

export function resetTaxiMeter(meter: TaxiMeterSnapshot) {
  Object.assign(meter, createTaxiMeter());
}

export function calculateMeterFare(meter: TaxiMeterSnapshot) {
  const config = GAME_CONFIG.taxi.meter;
  const categoryMultiplier = meter.category === 'urgent' ? 1.12 : meter.category === 'comfort' ? 1.08 : 1;
  const raw = (config.initialFare
    + meter.distanceMeters / 1_000 * config.perKilometer
    + meter.waitingSeconds / 60 * config.waitingPerMinute)
    * meter.demandMultiplier * categoryMultiplier;
  return roundMoney(clamp(raw, config.minimumFare, config.safetyLimit));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
