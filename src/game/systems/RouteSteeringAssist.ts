import type { Point } from '../../types/game';

export interface RouteGuidance {
  steering: number;
  preferredRoadHeading: number;
  targetSpeedMps: number;
}

export function guidanceForRoute(
  position: Point,
  rotation: number,
  speedMps: number,
  route: Point[],
  cruiseSpeedMps = 16,
  brakingMps2 = 10
): RouteGuidance {
  if (route.length < 2) {
    return { steering: 0, preferredRoadHeading: rotation, targetSpeedMps: 0 };
  }

  const location = locateOnActiveRoute(position, route);
  const activePath = [location.point, ...route.slice(location.segmentIndex + 1)];
  const totalLength = pathLength(activePath);
  if (totalLength < 0.05) {
    return { steering: 0, preferredRoadHeading: rotation, targetSpeedMps: 0 };
  }

  // A compact look-ahead starts the turn before the junction without aiming
  // across a whole block or cutting a long chord through the sidewalk.
  const lookAhead = clamp(6 + Math.abs(speedMps) * 0.58, 6, 13);
  const targetDistance = Math.min(totalLength, lookAhead);
  const target = pointAtDistance(activePath, targetDistance);
  const desiredAngle = Math.atan2(target.y - position.y, target.x - position.x);
  const error = angleDelta(rotation, desiredAngle);
  const responseAngle = 0.38 + Math.min(0.2, Math.abs(speedMps) * 0.01);
  const headingTargetSpeed = Math.abs(error) > 0.22
    ? clamp(cruiseSpeedMps - (Math.abs(error) - 0.22) * 8.5, 3.2, cruiseSpeedMps)
    : cruiseSpeedMps;

  const tangentStart = pointAtDistance(activePath, Math.max(0, targetDistance - 1.5));
  const tangentEnd = pointAtDistance(activePath, Math.min(totalLength, targetDistance + 3));
  const tangentLength = Math.hypot(tangentEnd.x - tangentStart.x, tangentEnd.y - tangentStart.y);
  const preferredRoadHeading = tangentLength > 0.1
    ? Math.atan2(tangentEnd.y - tangentStart.y, tangentEnd.x - tangentStart.x)
    : desiredAngle;

  return {
    steering: clamp(error / responseAngle, -1, 1),
    preferredRoadHeading,
    targetSpeedMps: Math.min(
      headingTargetSpeed,
      speedForUpcomingCurves(activePath, cruiseSpeedMps, brakingMps2)
    )
  };
}

export function steeringForRoute(position: Point, rotation: number, speedMps: number, route: Point[]) {
  return guidanceForRoute(position, rotation, speedMps, route).steering;
}

function locateOnActiveRoute(position: Point, route: Point[]) {
  const first = projectOnSegment(position, route[0], route[1]);
  const firstDistance = Math.hypot(first.point.x - position.x, first.point.y - position.y);
  if (firstDistance <= 28) return { point: first.point, segmentIndex: 0 };

  let best = { point: first.point, segmentIndex: 0, distance: firstDistance };
  let scannedDistance = 0;
  for (let index = 0; index < route.length - 1 && scannedDistance <= 55; index += 1) {
    const projection = projectOnSegment(position, route[index], route[index + 1]);
    const distance = Math.hypot(projection.point.x - position.x, projection.point.y - position.y);
    if (distance < best.distance) best = { point: projection.point, segmentIndex: index, distance };
    scannedDistance += Math.hypot(route[index + 1].x - route[index].x, route[index + 1].y - route[index].y);
  }
  return { point: best.point, segmentIndex: best.segmentIndex };
}

function speedForUpcomingCurves(path: Point[], cruiseSpeedMps: number, brakingMps2: number) {
  const totalLength = pathLength(path);
  const scanDistance = Math.min(58, totalLength);
  let targetSpeed = cruiseSpeedMps;

  // Measure the direction on both sides of samples along the route. This sees
  // both a single 90-degree corner and a bend made from several short segments.
  for (let distance = 4; distance < scanDistance - 2; distance += 3) {
    const before = pointAtDistance(path, Math.max(0, distance - 6));
    const center = pointAtDistance(path, distance);
    const after = pointAtDistance(path, Math.min(totalLength, distance + 6));
    const beforeLength = Math.hypot(center.x - before.x, center.y - before.y);
    const afterLength = Math.hypot(after.x - center.x, after.y - center.y);
    if (beforeLength < 1.5 || afterLength < 1.5) continue;

    const incoming = Math.atan2(center.y - before.y, center.x - before.x);
    const outgoing = Math.atan2(after.y - center.y, after.x - center.x);
    const turn = Math.abs(angleDelta(incoming, outgoing));
    if (turn < 0.3) continue;

    const cornerSpeed = clamp(15 - turn * 7.1, 3.6, cruiseSpeedMps);
    const brakingDistance = Math.max(0, distance - 4);
    const permittedSpeed = Math.sqrt(cornerSpeed ** 2 + 2 * brakingMps2 * 0.48 * brakingDistance);
    targetSpeed = Math.min(targetSpeed, permittedSpeed);
  }

  return targetSpeed;
}

function pointAtDistance(path: Point[], distance: number): Point {
  let remaining = Math.max(0, distance);
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length >= remaining && length > 0.001) return interpolate(start, end, remaining / length);
    remaining -= length;
  }
  return { ...path[path.length - 1] };
}

function pathLength(path: Point[]) {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.hypot(path[index + 1].x - path[index].x, path[index + 1].y - path[index].y);
  }
  return total;
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
