import type { Point } from '../../types/game';

export type FleetTripStage = 'to-pickup' | 'to-destination';

/** Keeps a destination stable across route recalculation and simulation layers. */
export class FleetRoutePlan {
  private index = 0;
  private stage: FleetTripStage = 'to-pickup';

  current(waypoints: Point[]) {
    return waypoints.length ? waypoints[this.index % waypoints.length] : undefined;
  }

  currentIndex() {
    return this.index;
  }

  currentStage() {
    return this.stage;
  }

  arrive(waypointCount: number) {
    if (waypointCount > 0) this.index = (this.index + 1) % waypointCount;
    this.stage = this.stage === 'to-pickup' ? 'to-destination' : 'to-pickup';
    return this.stage;
  }

  skipUnreachable(waypointCount: number) {
    if (waypointCount > 0) this.index = (this.index + 1) % waypointCount;
  }

  reset() {
    this.index = 0;
    this.stage = 'to-pickup';
  }
}

export function employeeIdentification(name: string) {
  return `Motorista ${name.trim()}`;
}

/**
 * Samples the full city and permutes the angular order. Sequential angular
 * candidates made the employee look like it was orbiting one neighborhood.
 */
export function buildFleetWaypoints(candidates: Point[], taxiStops: Point[], garage: Point, maximumCityStops = 12) {
  const count = Math.min(maximumCityStops, candidates.length);
  const sampled = Array.from({ length: count }, (_, index) => candidates[Math.floor((index + 0.5) * candidates.length / count)]);
  const step = coprimeStep(count);
  const dispersed = Array.from({ length: count }, (_, index) => sampled[index * step % count]);
  const ordered: Point[] = [{ ...garage }];
  dispersed.forEach((point, index) => {
    ordered.push({ ...point });
    const taxi = taxiStops[index % Math.max(1, taxiStops.length)];
    if (taxi && index % Math.max(1, Math.floor(count / Math.max(1, taxiStops.length))) === 1) ordered.push({ ...taxi });
  });
  return ordered.filter((point, index) => index === 0 || ordered.slice(0, index).every((other) => Math.hypot(point.x - other.x, point.y - other.y) > 12));
}

function coprimeStep(count: number) {
  if (count <= 2) return 1;
  for (let candidate = Math.floor(count / 2) - 1; candidate >= 2; candidate -= 1) {
    if (greatestCommonDivisor(candidate, count) === 1) return candidate;
  }
  return 1;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}
