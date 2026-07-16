import { GAME_CONFIG } from '../../config/gameConfig';
import type { Point } from '../../types/game';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';

export interface VehicleInput {
  throttle: number;
  steering: number;
  handbrake: boolean;
  assistanceEnabled?: boolean;
}

export class VehicleController {
  position: Point;
  rotation: number;
  speed = 0;
  fuelUsed = 0;
  conditionDamage = 0;
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
      const drag = config.rollingResistance * deltaSeconds;
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    if (input.handbrake) this.speed *= Math.max(0, 1 - 5.5 * deltaSeconds);
    this.speed = Math.max(-config.maxReverseMps, Math.min(config.maxSpeedMps, this.speed));

    const speedRatio = Math.min(1, Math.abs(this.speed) / config.maxSpeedMps);
    const lowSpeedGrip = 0.52 + Math.min(1, Math.abs(this.speed) / 5) * 0.48;
    const highSpeedStability = 1 - speedRatio * 0.38;
    const reverseDirection = this.speed < 0 ? -1 : 1;
    const steeringRate = config.steeringRadiansPerSecond * lowSpeedGrip * highSpeedStability * (input.handbrake ? 1.3 : 1);
    this.rotation += input.steering * steeringRate * reverseDirection * deltaSeconds;

    const roadBeforeMove = this.roads.nearestRoad(this.position, this.rotation);
    if (input.assistanceEnabled && roadBeforeMove && Math.abs(input.steering) < 0.1 && Math.abs(this.speed) > 1.5) {
      const roadHeading = roadBeforeMove.oneway
        ? roadBeforeMove.tangentAngle
        : closestRoadHeading(this.rotation, roadBeforeMove.tangentAngle);
      const headingError = angleDelta(this.rotation, roadHeading);
      if (Math.abs(headingError) < config.steeringAssistMaxAngle) {
        this.rotation += clamp(headingError, -config.steeringAssistRadiansPerSecond * deltaSeconds, config.steeringAssistRadiansPerSecond * deltaSeconds);
      }
    }

    const distance = this.speed * deltaSeconds;
    this.position.x += Math.cos(this.rotation) * distance;
    this.position.y += Math.sin(this.rotation) * distance;

    const road = this.roads.nearestRoad(this.position, this.rotation);
    const outsideReliableAsphalt = !road || road.unionSurfaceDistance > -config.widthMeters * 0.48;
    if (outsideReliableAsphalt) {
      const speedMagnitude = Math.abs(this.speed);
      const resistance = speedMagnitude > config.offRoadMaxSpeedMps
        ? config.offRoadBrakingMps2
        : config.offRoadResistance;
      this.speed -= Math.sign(this.speed) * Math.min(speedMagnitude, resistance * deltaSeconds);
    } else if (road.unionSurfaceDistance < -0.4) {
      this.safePosition = { ...this.position };
      this.safeRotation = this.rotation;
    }

    const travelled = Math.hypot(this.position.x - previous.x, this.position.y - previous.y);
    this.fuelUsed += config.idleFuelLitersPerSecond * deltaSeconds + travelled * config.movingFuelLitersPerMeter;
    return travelled;
  }

  alignToRoad(snapToCenter = false) {
    const road = this.roads.nearestRoad(this.position, this.rotation);
    if (!road) return false;
    this.rotation = road.oneway ? road.tangentAngle : closestRoadHeading(this.rotation, road.tangentAngle);
    if (snapToCenter || road.surfaceDistance > -0.3) this.position = this.roads.laneCenter(road, this.rotation);
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
