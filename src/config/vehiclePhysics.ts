/**
 * Fonte única dos parâmetros físicos do Hatch. Valores em unidades SI.
 * Ajustes de dirigibilidade devem acontecer aqui, sem números mágicos na cena.
 */
export const VEHICLE_PHYSICS = {
  maxSpeedMps: 25,
  maxReverseMps: 5,
  accelerationMps2: 9,
  reverseAccelerationMps2: 4,
  brakeMps2: 10,
  handbrakeMps2: 16,
  rollingResistance: 0.65,
  aerodynamicDrag: 0.0004,
  lateralGrip: 8.5,
  steeringRadiansPerSecond: 2.65,
  steeringLowSpeedGrip: 0.52,
  steeringGripSpeedMps: 5,
  steeringHighSpeedReduction: 0.38,
  handbrakeSteeringMultiplier: 1.3,
  steeringCenterDeadzone: 0.025,
  steeringAssistRadiansPerSecond: 0.9,
  steeringAssistMaxAngle: 0.72,
  offRoadResistance: 3.5,
  offRoadBrakingMps2: 14,
  offRoadMaxSpeedMps: 8,
  autopilotCruiseSpeedMps: 16,
  autopilotRecoverySpeedMps: 3.5,
  autopilotRoadRecoveryRadiansPerSecond: 3.2,
  lengthMeters: 4.1,
  widthMeters: 1.82,
  fuelCapacityLiters: 40,
  idleFuelLitersPerSecond: 0.0002,
  movingFuelLitersPerMeter: 0.00011,
  repositionHoldSeconds: 1.1,
  repositionFee: 1
} as const;

export const COLLISION_PHYSICS = {
  contactToleranceMeters: 0.12,
  sweepStepMeters: 0.55,
  cooldownSeconds: 1.25,
  npcStunSeconds: 3.2,
  autopilotGhostSeconds: 2.4,
  severityKmh: {
    contact: 5,
    light: 20,
    moderate: 50
  },
  conditionDamage: {
    contact: 0,
    light: 0.2,
    moderate: 1.1,
    severe: 3.2
  },
  retainedSpeed: {
    contact: 0.92,
    light: 0.72,
    moderate: 0.38,
    severe: 0.12
  },
  cameraShake: {
    contact: 0,
    light: 0.0018,
    moderate: 0.004,
    severe: 0.007
  },
  vibrationMs: {
    contact: 0,
    light: 30,
    moderate: 70,
    severe: 130
  }
} as const;
