import type { Point } from '../../types/game';

export interface MovingBody {
  position: Point;
  heading: number;
  speed: number;
}

export function distanceAhead(origin: Point, heading: number, target: Point, maxLateral: number) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const forwardX = Math.cos(heading);
  const forwardY = Math.sin(heading);
  const longitudinal = dx * forwardX + dy * forwardY;
  const lateral = Math.abs(dx * -forwardY + dy * forwardX);
  return longitudinal > 0 && lateral < maxLateral ? longitudinal : null;
}

export function distanceAlongRoute(
  origin: Point,
  route: Point[],
  target: Point,
  maxLateral: number,
  maxDistance = Number.POSITIVE_INFINITY
) {
  if (route.length < 2) return null;
  let travelled = Math.hypot(origin.x - route[0].x, origin.y - route[0].y);
  for (let index = 0; index < route.length - 1 && travelled <= maxDistance; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const progress = clamp(((target.x - start.x) * dx + (target.y - start.y) * dy) / (length * length), 0, 1);
    const projected = { x: start.x + dx * progress, y: start.y + dy * progress };
    if (Math.hypot(target.x - projected.x, target.y - projected.y) <= maxLateral) {
      const distance = travelled + length * progress;
      return distance <= maxDistance ? distance : null;
    }
    travelled += length;
  }
  return null;
}

export function pathsConflict(a: MovingBody, b: MovingBody, horizonSeconds: number, clearanceMeters: number) {
  const relativeX = b.position.x - a.position.x;
  const relativeY = b.position.y - a.position.y;
  const velocityX = Math.cos(b.heading) * b.speed - Math.cos(a.heading) * a.speed;
  const velocityY = Math.sin(b.heading) * b.speed - Math.sin(a.heading) * a.speed;
  const relativeSpeedSq = velocityX * velocityX + velocityY * velocityY;
  if (relativeSpeedSq < 0.01) return false;
  const closestTime = clamp(-(relativeX * velocityX + relativeY * velocityY) / relativeSpeedSq, 0, horizonSeconds);
  if (closestTime < 0.08) return false;
  const closestX = relativeX + velocityX * closestTime;
  const closestY = relativeY + velocityY * closestTime;
  return Math.hypot(closestX, closestY) < clearanceMeters;
}

export function yieldingPathsConflict(a: MovingBody, b: MovingBody, horizonSeconds: number, clearanceMeters: number) {
  const alignment = Math.cos(b.heading - a.heading);
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const longitudinal = dx * Math.cos(a.heading) + dy * Math.sin(a.heading);
  if (alignment > 0.55 && longitudinal <= 0) return false;
  return pathsConflict(a, b, horizonSeconds, clearanceMeters);
}

export function pointOverlapsVehicle(
  point: Point,
  vehiclePosition: Point,
  vehicleHeading: number,
  vehicleLength: number,
  vehicleWidth: number,
  pointLength: number,
  pointWidth: number
) {
  const dx = point.x - vehiclePosition.x;
  const dy = point.y - vehiclePosition.y;
  const longitudinal = Math.abs(dx * Math.cos(vehicleHeading) + dy * Math.sin(vehicleHeading));
  const lateral = Math.abs(dx * -Math.sin(vehicleHeading) + dy * Math.cos(vehicleHeading));
  return longitudinal < vehicleLength * 0.5 + pointLength * 0.42
    && lateral < vehicleWidth * 0.5 + pointWidth * 0.44;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
