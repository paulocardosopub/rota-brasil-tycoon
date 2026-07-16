import type { Point } from '../../types/game';

export interface ActiveRouteProgress {
  route: Point[];
  deviationMeters: number;
  remainingMeters: number;
}

/** Advances an active route by projecting onto its nearby segments. */
export function advanceActiveRoute(route: Point[], position: Point, maximumDeviationMeters = 24): ActiveRouteProgress {
  if (route.length < 2) {
    return { route, deviationMeters: Number.POSITIVE_INFINITY, remainingMeters: routeRemainingDistance(route, position) };
  }

  let bestIndex = 0;
  let bestPoint = route[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  let scannedDistance = 0;
  const firstSegmentLength = distance(route[0], route[1]);
  const maximumScanDistance = Math.max(45, firstSegmentLength + 35);
  const lastIndex = Math.min(route.length - 1, 20);

  for (let index = 0; index < lastIndex; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentLength = distance(start, end);
    if (scannedDistance > maximumScanDistance) break;
    scannedDistance += segmentLength;
    if (segmentLength < 0.1) continue;
    const point = closestPointOnSegment(position, start, end);
    const deviation = distance(position, point);
    if (deviation < bestDistance) {
      bestDistance = deviation;
      bestIndex = index;
      bestPoint = point;
    }
  }

  let advanced = route;
  if (bestDistance <= maximumDeviationMeters) {
    const remaining = route.slice(bestIndex + 1);
    while (remaining.length && distance(remaining[0], bestPoint) < 0.1) remaining.shift();
    advanced = remaining.length ? [bestPoint, ...remaining] : [bestPoint, { ...route[route.length - 1] }];
  }

  return {
    route: advanced,
    deviationMeters: bestDistance,
    remainingMeters: routeRemainingDistance(advanced, position)
  };
}

export function routeRemainingDistance(route: Point[], position: Point) {
  if (!route.length) return 0;
  return distance(position, route[0]) + pathLength(route);
}

export function pointAlongRoute(route: Point[], distanceMeters: number): Point {
  if (!route.length) return { x: 0, y: 0 };
  let remaining = Math.max(0, distanceMeters);
  for (let index = 0; index < route.length - 1; index += 1) {
    const length = distance(route[index], route[index + 1]);
    if (length >= remaining && length > 0.001) {
      const ratio = remaining / length;
      return {
        x: route[index].x + (route[index + 1].x - route[index].x) * ratio,
        y: route[index].y + (route[index + 1].y - route[index].y) * ratio
      };
    }
    remaining -= length;
  }
  return { ...route[route.length - 1] };
}

function pathLength(route: Point[]) {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) total += distance(route[index - 1], route[index]);
  return total;
}

function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return { ...a };
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { x: a.x + dx * ratio, y: a.y + dy * ratio };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
