import { GAME_CONFIG } from '../../config/gameConfig';
import type { Point } from '../../types/game';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';

export interface VehicleInput {
  throttle: number;
  steering: number;
  handbrake: boolean;
}

export class VehicleController {
  position: Point;
  rotation: number;
  speed = 0;
  fuelUsed = 0;
  conditionDamage = 0;
  private safePosition: Point;
  private safeRotation: number;
  private curbContact = false;

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
      const drag = config.rollingResistance * deltaSeconds;
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    if (input.handbrake) this.speed *= Math.max(0, 1 - 5.5 * deltaSeconds);
    this.speed = Math.max(-config.maxReverseMps, Math.min(config.maxSpeedMps, this.speed));

    const speedRatio = Math.min(1, Math.abs(this.speed) / config.maxSpeedMps);
    const lowSpeedGrip = 0.34 + Math.min(1, Math.abs(this.speed) / 6) * 0.66;
    const highSpeedStability = 1 - speedRatio * 0.48;
    const reverseDirection = this.speed < 0 ? -1 : 1;
    const steeringRate = config.steeringRadiansPerSecond * lowSpeedGrip * highSpeedStability * (input.handbrake ? 1.3 : 1);
    this.rotation += input.steering * steeringRate * reverseDirection * deltaSeconds;

    const roadBeforeMove = this.roads.nearestRoad(this.position);
    if (roadBeforeMove && Math.abs(input.steering) < 0.1 && Math.abs(this.speed) > 1.5) {
      const roadHeading = closestRoadHeading(this.rotation, roadBeforeMove.tangentAngle);
      const headingError = angleDelta(this.rotation, roadHeading);
      if (Math.abs(headingError) < config.steeringAssistMaxAngle) {
        this.rotation += clamp(headingError, -config.steeringAssistRadiansPerSecond * deltaSeconds, config.steeringAssistRadiansPerSecond * deltaSeconds);
      }
    }

    const distance = this.speed * deltaSeconds;
    this.position.x += Math.cos(this.rotation) * distance;
    this.position.y += Math.sin(this.rotation) * distance;

    const road = this.roads.nearestRoad(this.position);
    if (!road) {
      this.position = previous;
      this.speed *= 0.7;
    } else {
      const desiredCenterLimit = Math.max(0.9, road.halfWidth * config.laneAssistStartRatio);
      if (Math.abs(input.steering) < 0.55 && Math.abs(this.speed) > 1 && road.centerDistance > desiredCenterLimit) {
        const correction = Math.min(
          road.centerDistance - desiredCenterLimit,
          (config.laneCenteringMetersPerSecond + Math.abs(this.speed) * 0.08) * deltaSeconds
        );
        moveToward(this.position, road.closest, correction);
      }

      const curbLimit = Math.max(0.95, road.halfWidth - config.widthMeters * 0.48);
      if (road.centerDistance > curbLimit) {
        const speedAtImpact = Math.abs(this.speed);
        moveToDistanceFrom(this.position, road.closest, curbLimit);
        const roadHeading = closestRoadHeading(this.rotation, road.tangentAngle);
        this.rotation += clamp(angleDelta(this.rotation, roadHeading), -0.2, 0.2);
        this.speed *= 0.82;
        if (!this.curbContact && speedAtImpact > 10) this.conditionDamage += Math.min(0.3, speedAtImpact * 0.01);
        this.curbContact = true;
      } else {
        this.curbContact = false;
      }

      if (road.surfaceDistance > -0.25) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), config.offRoadResistance * deltaSeconds);
      }
      if (!this.curbContact && road.surfaceDistance < -0.4) {
        this.safePosition = { ...this.position };
        this.safeRotation = this.rotation;
      }
    }

    const travelled = Math.hypot(this.position.x - previous.x, this.position.y - previous.y);
    this.fuelUsed += config.idleFuelLitersPerSecond * deltaSeconds + travelled * config.movingFuelLitersPerMeter;
    return travelled;
  }

  alignToRoad(snapToCenter = false) {
    const road = this.roads.nearestRoad(this.position);
    if (!road) return false;
    this.rotation = closestRoadHeading(this.rotation, road.tangentAngle);
    if (snapToCenter || road.surfaceDistance > -0.3) this.position = { ...road.closest };
    this.safePosition = { ...this.position };
    this.safeRotation = this.rotation;
    this.speed = 0;
    return true;
  }

  reposition() {
    this.position = { ...this.safePosition };
    this.rotation = this.safeRotation;
    this.speed = 0;
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

function moveToward(point: Point, target: Point, distance: number) {
  const dx = target.x - point.x;
  const dy = target.y - point.y;
  const length = Math.hypot(dx, dy);
  if (!length) return;
  point.x += dx / length * Math.min(distance, length);
  point.y += dy / length * Math.min(distance, length);
}

function moveToDistanceFrom(point: Point, center: Point, distance: number) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const length = Math.hypot(dx, dy);
  if (!length) {
    point.x = center.x;
    point.y = center.y;
    return;
  }
  point.x = center.x + dx / length * distance;
  point.y = center.y + dy / length * distance;
}
