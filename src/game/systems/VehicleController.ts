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
    if (input.throttle > 0 && canAccelerate) this.speed += input.throttle * config.accelerationMps2 * deltaSeconds;
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

    const steerGrip = Math.min(1, Math.abs(this.speed) / 3.5);
    const reverseDirection = this.speed < 0 ? -1 : 1;
    this.rotation += input.steering * config.steeringRadiansPerSecond * steerGrip * reverseDirection * deltaSeconds;
    const distance = this.speed * deltaSeconds;
    this.position.x += Math.cos(this.rotation) * distance;
    this.position.y += Math.sin(this.rotation) * distance;

    const offRoadDistance = this.roads.distanceFromRoad(this.position);
    if (offRoadDistance > 2.8) {
      this.position = previous;
      if (Math.abs(this.speed) > 4) this.conditionDamage += Math.min(0.7, Math.abs(this.speed) * 0.018);
      this.speed *= -0.12;
    } else if (offRoadDistance > 0) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), config.offRoadResistance * deltaSeconds);
    } else if (Math.abs(this.speed) < 3.5) {
      this.safePosition = { ...this.position };
      this.safeRotation = this.rotation;
    }

    const travelled = Math.hypot(this.position.x - previous.x, this.position.y - previous.y);
    this.fuelUsed += config.idleFuelLitersPerSecond * deltaSeconds + travelled * config.movingFuelLitersPerMeter;
    return travelled;
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
