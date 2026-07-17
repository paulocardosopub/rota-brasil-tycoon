import type { Point } from '../../types/game';

export interface ActiveRouteProgress {
  route: Point[];
  deviationMeters: number;
  remainingMeters: number;
}

/** Advances an active route by projecting onto its nearby segments. */
export function advanceActiveRoute(route: Point[], position: Point, maximumDeviationMeters = 24): ActiveRouteProgress {
  while (route.length >= 2 && distance(route[0], route[1]) < 0.1) route = route.slice(1);
  if (route.length < 2) {
    return { route, deviationMeters: Number.POSITIVE_INFINITY, remainingMeters: routeRemainingDistance(route, position) };
  }

  const first = closestPointOnSegment(position, route[0], route[1]);
  let bestIndex = 0;
  let bestPoint = first.point;
  let bestDistance = distance(position, first.point);
  let previousProjection = first;
  let previousPassed = first.t >= 0.82 || distance(position, route[1]) <= 6;
  const lastIndex = Math.min(route.length - 1, 20);

  // Only advance through contiguous segments that the vehicle has actually
  // reached. Choosing the globally closest segment made loops and parallel
  // carriageways skip several instructions and sent the pilot across grass.
  for (let index = 1; index < lastIndex && previousPassed; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentLength = distance(start, end);
    if (segmentLength < 0.1) continue;
    const projection = closestPointOnSegment(position, start, end);
    const deviation = distance(position, projection.point);
    if (deviation + 0.2 < bestDistance || (previousProjection.t >= 0.98 && deviation <= bestDistance + 0.5)) {
      bestDistance = deviation;
      bestIndex = index;
      bestPoint = projection.point;
    }
    previousProjection = projection;
    previousPassed = deviation <= maximumDeviationMeters
      && (projection.t >= 0.82 || distance(position, end) <= 6);
  }

  let advanced = route;
  if (bestDistance <= maximumDeviationMeters) {
    const remaining = route.slice(bestIndex + 1);
    while (remaining.length && distance(remaining[0], bestPoint) < 0.1) remaining.shift();
    advanced = [bestPoint, ...remaining];
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

function closestPointOnSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return { point: { ...a }, t: 0 };
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { point: { x: a.x + dx * ratio, y: a.y + dy * ratio }, t: ratio };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
