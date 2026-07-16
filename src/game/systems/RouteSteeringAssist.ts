import type { Point } from '../../types/game';

export function steeringForRoute(position: Point, rotation: number, speedMps: number, route: Point[]) {
  if (route.length < 2) return 0;

  let segmentIndex = 0;
  let segmentProgress = 0;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    const projection = projectOnSegment(position, route[index - 1], route[index]);
    const distanceSq = (projection.point.x - position.x) ** 2 + (projection.point.y - position.y) ** 2;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      segmentIndex = index - 1;
      segmentProgress = projection.t;
    }
  }

  const lookAhead = 6 + Math.min(18, Math.abs(speedMps) * 1.35);
  let target = interpolate(route[segmentIndex], route[segmentIndex + 1], segmentProgress);
  let remainingLookAhead = lookAhead;
  for (let index = segmentIndex; index < route.length - 1; index += 1) {
    const start = index === segmentIndex ? target : route[index];
    const end = route[index + 1];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    if (distance >= remainingLookAhead) {
      target = interpolate(start, end, remainingLookAhead / Math.max(distance, 0.001));
      remainingLookAhead = 0;
      break;
    }
    target = end;
    remainingLookAhead -= distance;
  }

  const desiredAngle = Math.atan2(target.y - position.y, target.x - position.x);
  const error = angleDelta(rotation, desiredAngle);
  const responseAngle = 0.42 + Math.min(0.24, Math.abs(speedMps) * 0.012);
  return clamp(error / responseAngle, -1, 1);
}

function projectOnSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return { point: { ...a }, t: 0 };
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return { point: interpolate(a, b, t), t };
}

function interpolate(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
