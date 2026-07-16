import { GAME_CONFIG } from '../../config/gameConfig';
import type { Point } from '../../types/game';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';

export interface VehicleInput {
  throttle: number;
  steering: number;
  handbrake: boolean;
  assistanceEnabled?: boolean;
  assistanceHeading?: number;
}

export class VehicleController {
  position: Point;
  rotation: number;
  speed = 0;
  fuelUsed = 0;
  conditionDamage = 0;
  autopilotRoadCorrections = 0;
  minimumAutopilotRoadClearance = Number.POSITIVE_INFINITY;
  private safePosition: Point;
  private safeRotation: number;

  constructor(position: Point, rotation: number, private readonly roads: RoadSurfaceIndex) {
    this.position = { ...position };
    this.rotation = rotation;
    this.safePosition = { ...position };
    this.safeRotation = rotation;
  }

  update(input: VehicleInput, deltaSeconds: number, fuel: number) {
    const config = GAME_CONFIG.vehicle;
    const previous = { ...this.position };
    const canAccelerate = fuel > 0;
    if (input.throttle > 0 && canAccelerate) {
      const acceleration = this.speed < -0.35 ? config.brakeMps2 : config.accelerationMps2 * (1 - Math.max(0, this.speed) / config.maxSpeedMps * 0.3);
      this.speed += input.throttle * acceleration * deltaSeconds;
    }
    if (input.throttle < 0) {
      if (this.speed > 0.35) this.speed += input.throttle * config.brakeMps2 * deltaSeconds;
      else if (canAccelerate) this.speed += input.throttle * config.reverseAccelerationMps2 * deltaSeconds;
    }
    if (!input.throttle) {
      const drag = (config.rollingResistance + Math.abs(this.speed) * Math.abs(this.speed) * config.aerodynamicDrag) * deltaSeconds;
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    if (input.handbrake) {
      const braking = config.handbrakeMps2 * deltaSeconds;
      this.speed = Math.abs(this.speed) <= braking ? 0 : this.speed - Math.sign(this.speed) * braking;
    }
    this.speed = Math.max(-config.maxReverseMps, Math.min(config.maxSpeedMps, this.speed));

    const speedRatio = Math.min(1, Math.abs(this.speed) / config.maxSpeedMps);
    const lowSpeedGrip = config.steeringLowSpeedGrip
      + Math.min(1, Math.abs(this.speed) / config.steeringGripSpeedMps) * (1 - config.steeringLowSpeedGrip);
    const highSpeedStability = 1 - speedRatio * config.steeringHighSpeedReduction;
    const reverseDirection = this.speed < 0 ? -1 : 1;
    const steeringRate = config.steeringRadiansPerSecond * lowSpeedGrip * highSpeedStability
      * (input.handbrake ? config.handbrakeSteeringMultiplier : 1);
    const steering = Math.abs(input.steering) < config.steeringCenterDeadzone ? 0 : input.steering;
    this.rotation += steering * steeringRate * reverseDirection * deltaSeconds;

    const preferredHeading = input.assistanceEnabled && Number.isFinite(input.assistanceHeading)
      ? input.assistanceHeading!
      : this.rotation;
    const roadBeforeMove = this.roads.nearestRoad(this.position, preferredHeading);
    if (input.assistanceEnabled && roadBeforeMove && Math.abs(input.steering) < 0.1 && Math.abs(this.speed) > 1.5) {
      const roadHeading = roadBeforeMove.oneway
        ? roadBeforeMove.tangentAngle
        : closestRoadHeading(preferredHeading, roadBeforeMove.tangentAngle);
      const headingError = angleDelta(this.rotation, roadHeading);
      if (Math.abs(headingError) < config.steeringAssistMaxAngle) {
        this.rotation += clamp(headingError, -config.steeringAssistRadiansPerSecond * deltaSeconds, config.steeringAssistRadiansPerSecond * deltaSeconds);
      }
    }
    if (input.assistanceEnabled && roadBeforeMove && Math.abs(input.steering) < 0.65) {
      const edgeClearance = -roadBeforeMove.unionSurfaceDistance - config.widthMeters * 0.5;
      const recoveryStrength = clamp((1.4 - edgeClearance) / 1.4, 0, 1);
      if (recoveryStrength > 0) {
        const roadHeading = roadBeforeMove.oneway
          ? roadBeforeMove.tangentAngle
          : closestRoadHeading(preferredHeading, roadBeforeMove.tangentAngle);
        const laneCenter = this.roads.laneCenter(roadBeforeMove, roadHeading);
        const lookAhead = 6 + Math.min(8, Math.abs(this.speed) * 0.5);
        const recoveryTarget = {
          x: laneCenter.x + Math.cos(roadHeading) * lookAhead,
          y: laneCenter.y + Math.sin(roadHeading) * lookAhead
        };
        const recoveryError = angleDelta(
          this.rotation,
          Math.atan2(recoveryTarget.y - this.position.y, recoveryTarget.x - this.position.x)
        );
        const maxRecovery = config.autopilotRoadRecoveryRadiansPerSecond * recoveryStrength * deltaSeconds;
        this.rotation += clamp(recoveryError, -maxRecovery, maxRecovery);
      }
    }

    const distance = this.speed * deltaSeconds;
    this.position.x += Math.cos(this.rotation) * distance;
    this.position.y += Math.sin(this.rotation) * distance;

    const requiredRoadInset = config.widthMeters * 0.5;
    let road = this.roads.nearestRoad(this.position, preferredHeading);
    let outsideReliableAsphalt = !road || road.unionSurfaceDistance > -requiredRoadInset;
    if (input.assistanceEnabled && outsideReliableAsphalt) {
      const guide = road ?? roadBeforeMove;
      if (guide && Math.abs(input.steering) < 0.2) {
        const roadHeading = guide.oneway
          ? guide.tangentAngle
          : closestRoadHeading(preferredHeading, guide.tangentAngle);
        const laneCenter = this.roads.laneCenter(guide, roadHeading);
        const recoveryTarget = {
          x: laneCenter.x + Math.cos(roadHeading) * 7,
          y: laneCenter.y + Math.sin(roadHeading) * 7
        };
        this.rotation += clamp(
          angleDelta(
            this.rotation,
            Math.atan2(recoveryTarget.y - this.position.y, recoveryTarget.x - this.position.x)
          ),
          -config.autopilotRoadRecoveryRadiansPerSecond * 0.5 * deltaSeconds,
          config.autopilotRoadRecoveryRadiansPerSecond * 0.5 * deltaSeconds
        );
      }
      this.autopilotRoadCorrections += 1;
      road = this.roads.nearestRoad(this.position, preferredHeading);
      outsideReliableAsphalt = !road || road.unionSurfaceDistance > -requiredRoadInset;
    }
    if (outsideReliableAsphalt) {
      const speedMagnitude = Math.abs(this.speed);
      const resistance = speedMagnitude > config.offRoadMaxSpeedMps
        ? config.offRoadBrakingMps2
        : config.offRoadResistance;
      this.speed -= Math.sign(this.speed) * Math.min(speedMagnitude, resistance * deltaSeconds);
    } else if (road && road.unionSurfaceDistance < -0.4) {
      this.safePosition = { ...this.position };
      this.safeRotation = this.rotation;
    }

    if (input.assistanceEnabled) {
      this.minimumAutopilotRoadClearance = Math.min(this.minimumAutopilotRoadClearance, this.roadEdgeClearance());
    }

    const travelled = Math.hypot(this.position.x - previous.x, this.position.y - previous.y);
    this.fuelUsed += config.idleFuelLitersPerSecond * deltaSeconds + travelled * config.movingFuelLitersPerMeter;
    return travelled;
  }

  alignToRoad(snapToCenter = false, preferredHeading = this.rotation) {
    const road = this.roads.nearestRoad(this.position, preferredHeading);
    if (!road) return false;
    this.rotation = road.oneway ? road.tangentAngle : closestRoadHeading(preferredHeading, road.tangentAngle);
    if (snapToCenter || road.surfaceDistance > -0.3) this.position = this.roads.laneCenter(road, this.rotation);
    this.safePosition = { ...this.position };
    this.safeRotation = this.rotation;
    this.speed = 0;
    return true;
  }

  engageAutopilot(preferredHeading = this.rotation) {
    const forwardSpeed = Math.max(0, this.speed);
    const aligned = this.alignToRoad(true, preferredHeading);
    if (aligned) this.speed = forwardSpeed;
    this.autopilotRoadCorrections = 0;
    this.minimumAutopilotRoadClearance = Number.POSITIVE_INFINITY;
    return aligned;
  }

  recoverAutopilotToLane(preferredHeading = this.rotation) {
    const forwardSpeed = Math.max(0, this.speed);
    const aligned = this.alignToRoad(true, preferredHeading);
    if (aligned) this.speed = Math.max(forwardSpeed, GAME_CONFIG.vehicle.autopilotRecoverySpeedMps);
    return aligned;
  }

  roadEdgeClearance(preferredHeading = this.rotation) {
    const road = this.roads.nearestRoad(this.position, preferredHeading);
    return road ? -road.unionSurfaceDistance - GAME_CONFIG.vehicle.widthMeters * 0.5 : Number.NEGATIVE_INFINITY;
  }

  reposition() {
    this.position = { ...this.safePosition };
    this.rotation = this.safeRotation;
    this.speed = 0;
  }

  resolveCollision(point: Point) {
    this.position = { ...point };
  }

  teleport(point: Point) {
    this.position = { ...point };
    this.safePosition = { ...point };
    this.speed = 0;
  }
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function closestRoadHeading(current: number, tangent: number) {
  const reverse = tangent + Math.PI;
  return Math.abs(angleDelta(current, tangent)) <= Math.abs(angleDelta(current, reverse)) ? tangent : reverse;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
