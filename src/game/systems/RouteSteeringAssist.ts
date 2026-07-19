import type { Point, VehicleModel } from '../../types/game';

export type RouteCurveClass = 'straight' | 'light' | 'medium' | 'sharp';

export interface AutopilotHandlingProfile {
  anticipationMultiplier: number;
  lightCurveSpeedFactor: number;
  mediumCurveSpeedFactor: number;
  sharpCurveSpeedFactor: number;
  safeDistanceMultiplier: number;
}

export interface RouteGuidance {
  steering: number;
  preferredRoadHeading: number;
  roadAnchor: Point;
  targetSpeedMps: number;
  curveClass: RouteCurveClass;
}

const CAR_PROFILE: AutopilotHandlingProfile = {
  anticipationMultiplier: 2,
  lightCurveSpeedFactor: 0.94,
  mediumCurveSpeedFactor: 0.72,
  sharpCurveSpeedFactor: 0.38,
  safeDistanceMultiplier: 1
};

export function autopilotProfileForVehicle(model?: VehicleModel): AutopilotHandlingProfile {
  if (model && ['Moto Urbana 125', 'Moto Cargo 160', 'Scooter Express 150'].includes(model)) {
    return { ...CAR_PROFILE, anticipationMultiplier: 1.75, lightCurveSpeedFactor: 0.9, mediumCurveSpeedFactor: 0.66, sharpCurveSpeedFactor: 0.34, safeDistanceMultiplier: 0.82 };
  }
  if (model === 'Micro-ônibus Urbano') {
    return { ...CAR_PROFILE, anticipationMultiplier: 2.35, lightCurveSpeedFactor: 0.86, mediumCurveSpeedFactor: 0.6, sharpCurveSpeedFactor: 0.29, safeDistanceMultiplier: 1.35 };
  }
  if (model === 'Ônibus Urbano Convencional') {
    return { ...CAR_PROFILE, anticipationMultiplier: 2.65, lightCurveSpeedFactor: 0.8, mediumCurveSpeedFactor: 0.52, sharpCurveSpeedFactor: 0.25, safeDistanceMultiplier: 1.6 };
  }
  if (model && ['Furgão Compacto', 'Van de Carga', 'Furgão Médio', 'Utilitário Baú'].includes(model)) {
    return { ...CAR_PROFILE, anticipationMultiplier: 2.25, lightCurveSpeedFactor: 0.88, mediumCurveSpeedFactor: 0.64, sharpCurveSpeedFactor: 0.31, safeDistanceMultiplier: 1.25 };
  }
  return CAR_PROFILE;
}

export function guidanceForRoute(
  position: Point,
  rotation: number,
  speedMps: number,
  route: Point[],
  cruiseSpeedMps = 16,
  brakingMps2 = 10,
  profile: AutopilotHandlingProfile = CAR_PROFILE
): RouteGuidance {
  if (route.length < 2) {
    return { steering: 0, preferredRoadHeading: rotation, roadAnchor: { ...position }, targetSpeedMps: 0, curveClass: 'straight' };
  }

  const location = locateOnActiveRoute(position, route);
  const activePath = normalizeRouteNoise([location.point, ...route.slice(location.segmentIndex + 1)]);
  const totalLength = pathLength(activePath);
  if (totalLength < 0.05) {
    return { steering: 0, preferredRoadHeading: rotation, roadAnchor: location.point, targetSpeedMps: 0, curveClass: 'straight' };
  }

  // A compact look-ahead starts the turn before the junction without aiming
  // across a whole block or cutting a long chord through the sidewalk.
  const curveClass = classifyCurveAhead(activePath, 24 * profile.anticipationMultiplier);
  // Só encurta a mira em curvas compostas. Um canto único precisa ser visto
  // com antecedência; tratá-lo como geometria densa faz o carro virar tarde.
  const compactCurve = activePath.length >= 4 && (curveClass === 'medium' || curveClass === 'sharp');
  const lookAhead = compactCurve
    ? clamp(4.2 + Math.abs(speedMps) * 0.25, 4.2, 7.2)
    : clamp(5.5 + Math.abs(speedMps) * 0.5, 5.5, 11.5);
  const upcomingCorner = firstSharpCorner(activePath, lookAhead + 5);
  // On a sharp corner, looking far down the next street creates a diagonal
  // chord across the sidewalk. Aim just beyond the apex until the car has
  // entered the turn, keeping the requested trajectory on the asphalt.
  const cornerSafeLookAhead = upcomingCorner
    ? upcomingCorner.distance + Math.min(2.5, Math.max(0, lookAhead - upcomingCorner.distance))
    : lookAhead;
  const targetDistance = Math.min(totalLength, lookAhead, cornerSafeLookAhead);
  const target = pointAtDistance(activePath, targetDistance);
  const desiredAngle = Math.atan2(target.y - position.y, target.x - position.x);
  const error = angleDelta(rotation, desiredAngle);
  const responseAngle = compactCurve ? 0.31 : 0.38 + Math.min(0.2, Math.abs(speedMps) * 0.01);
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
    roadAnchor: location.point,
    targetSpeedMps: Math.min(
      headingTargetSpeed,
      speedForUpcomingCurves(activePath, cruiseSpeedMps, brakingMps2, profile)
    ),
    curveClass
  };
}

export function normalizeRouteNoise(path: Point[]) {
  if (path.length <= 2) return path.map((point) => ({ ...point }));
  const deduplicated: Point[] = [];
  for (const point of path) {
    const previous = deduplicated[deduplicated.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.75) deduplicated.push({ ...point });
  }
  if (deduplicated.length <= 2) return deduplicated;
  const clean = [deduplicated[0]];
  for (let index = 1; index < deduplicated.length - 1; index += 1) {
    const previous = clean[clean.length - 1];
    const current = deduplicated[index];
    const next = deduplicated[index + 1];
    const incoming = Math.atan2(current.y - previous.y, current.x - previous.x);
    const outgoing = Math.atan2(next.y - current.y, next.x - current.x);
    const turn = Math.abs(angleDelta(incoming, outgoing));
    const seamLength = Math.min(
      Math.hypot(current.x - previous.x, current.y - previous.y),
      Math.hypot(next.x - current.x, next.y - current.y)
    );
    if (turn < 0.075 || (seamLength < 2.2 && turn < 0.28)) continue;
    clean.push(current);
  }
  clean.push(deduplicated[deduplicated.length - 1]);
  return clean;
}

function classifyCurveAhead(path: Point[], maximumDistance: number): RouteCurveClass {
  const total = pathLength(path);
  let strongest = 0;
  for (let distance = 5; distance < Math.min(total - 2, maximumDistance); distance += 4) {
    const before = pointAtDistance(path, Math.max(0, distance - 7));
    const center = pointAtDistance(path, distance);
    const after = pointAtDistance(path, Math.min(total, distance + 7));
    const incoming = Math.atan2(center.y - before.y, center.x - before.x);
    const outgoing = Math.atan2(after.y - center.y, after.x - center.x);
    strongest = Math.max(strongest, Math.abs(angleDelta(incoming, outgoing)));
  }
  if (strongest >= 0.72) return 'sharp';
  if (strongest >= 0.42) return 'medium';
  if (strongest >= 0.2) return 'light';
  return 'straight';
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

function speedForUpcomingCurves(path: Point[], cruiseSpeedMps: number, brakingMps2: number, profile: AutopilotHandlingProfile) {
  const totalLength = pathLength(path);
  const scanDistance = Math.min(58 * profile.anticipationMultiplier, totalLength);
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
    if (turn < 0.2) continue;

    const factor = turn >= 0.72
      ? profile.sharpCurveSpeedFactor
      : turn >= 0.42
        ? profile.mediumCurveSpeedFactor
        : profile.lightCurveSpeedFactor;
    const cornerSpeed = clamp(cruiseSpeedMps * factor, 3.6, cruiseSpeedMps);
    const brakingDistance = Math.max(0, distance - 4);
    const permittedSpeed = Math.sqrt(cornerSpeed ** 2 + 2 * brakingMps2 * 0.48 * brakingDistance);
    targetSpeed = Math.min(targetSpeed, permittedSpeed);
  }

  return targetSpeed;
}

function firstSharpCorner(path: Point[], maximumDistance: number) {
  let travelled = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    travelled += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
    if (travelled > maximumDistance) break;
    const incoming = Math.atan2(path[index].y - path[index - 1].y, path[index].x - path[index - 1].x);
    const outgoing = Math.atan2(path[index + 1].y - path[index].y, path[index + 1].x - path[index].x);
    const turn = Math.abs(angleDelta(incoming, outgoing));
    if (turn >= 0.48) return { distance: travelled, turn };
  }
  return null;
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
