export function missionApproachTargetSpeed(
  distanceMeters: number,
  interactionRadiusMeters: number,
  brakingMps2: number,
  cruiseSpeedMps: number
) {
  const brakingDistance = Math.max(0.08, distanceMeters - interactionRadiusMeters + 0.08);
  return Math.min(cruiseSpeedMps, Math.sqrt(2 * brakingMps2 * brakingDistance));
}

export function automaticThrottle(speedMps: number, targetSpeedMps: number) {
  const speed = Math.max(0, speedMps);
  const target = Math.max(0, targetSpeedMps);
  const error = target - speed;
  if (target < 0.05 && speed <= 0.45) return 0;
  if (error < -0.45) return clamp(error * 0.34, -1, -0.16);
  if (error > 0.45) return clamp(error * 0.25, 0.16, 1);
  return 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
