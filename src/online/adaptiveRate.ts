import type { Point } from '../types/game';

export type InterestLevel = 'NEAR' | 'MEDIUM' | 'DISTANT' | 'OUTSIDE';

export interface RateContext {
  speedMps: number;
  headingChange: number;
  distanceMeters: number;
  visible: boolean;
  connectionQuality: number;
  stopped: boolean;
}

export function interestLevel(distanceMeters: number): InterestLevel {
  if (distanceMeters <= 180) return 'NEAR';
  if (distanceMeters <= 520) return 'MEDIUM';
  if (distanceMeters <= 1_200) return 'DISTANT';
  return 'OUTSIDE';
}

export function movementRateHz(context: RateContext) {
  if (!context.visible || interestLevel(context.distanceMeters) === 'OUTSIDE') return 0;
  const quality = Math.max(0.25, Math.min(1, context.connectionQuality));
  if (context.stopped || Math.abs(context.speedMps) < 0.2) return round(clamp(1.5 * quality, 1, 2));
  let rate = Math.abs(context.speedMps) > 16 || Math.abs(context.headingChange) > 0.18 ? 15 : Math.abs(context.speedMps) < 2 ? 5 : 10;
  const interest = interestLevel(context.distanceMeters);
  if (interest === 'MEDIUM') rate *= 0.65;
  if (interest === 'DISTANT') rate *= 0.25;
  return round(clamp(rate * quality, 1, 15));
}

export function shouldSendMovement(lastSentAt: number, now: number, rateHz: number, importantEvent = false) {
  return importantEvent || (rateHz > 0 && now - lastSentAt >= 1_000 / rateHz);
}

export function distanceBetween(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number) { return Math.round(value * 10) / 10; }
