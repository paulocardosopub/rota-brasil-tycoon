import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';

interface AircraftShadow {
  visual: Phaser.GameObjects.Container;
  x: number;
  y: number;
  speed: number;
  heading: number;
}

export class AirTrafficSystem {
  private readonly aircraft: AircraftShadow[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    const total = GAME_CONFIG.environment.aircraftCount + GAME_CONFIG.environment.helicopterCount;
    for (let index = 0; index < total; index += 1) {
      const helicopter = index >= GAME_CONFIG.environment.aircraftCount;
      const graphics = scene.add.graphics();
      graphics.fillStyle(0x08141b, helicopter ? 0.19 : 0.14);
      if (helicopter) {
        graphics.fillEllipse(0, 0, 9, 3.5).fillRect(-2, -6, 4, 12).fillRect(-7, -0.5, 14, 1);
      } else {
        graphics.fillEllipse(0, 0, 15, 2.5).fillTriangle(-1, 0, 5, -7, 6, 0).fillTriangle(-1, 0, 5, 7, 6, 0);
      }
      const visual = scene.add.container(0, 0, [graphics]).setDepth(22).setScale(helicopter ? 1.2 : 1.8);
      const heading = -0.55 + (index % 4) * 0.32;
      this.aircraft.push({
        visual,
        x: -1_450 + (index * 283) % 2_900,
        y: -1_100 + (index * 419) % 2_200,
        speed: helicopter ? 22 + index % 3 * 3 : 48 + index % 4 * 6,
        heading
      });
    }
  }

  update(deltaSeconds: number, elapsedSeconds: number) {
    for (let index = 0; index < this.aircraft.length; index += 1) {
      const aircraft = this.aircraft[index];
      aircraft.x += Math.cos(aircraft.heading) * aircraft.speed * deltaSeconds;
      aircraft.y += Math.sin(aircraft.heading) * aircraft.speed * deltaSeconds;
      if (aircraft.x > 1_500 || aircraft.y < -1_200) {
        aircraft.x = -1_450;
        aircraft.y = 1_000 - (index * 227) % 2_000;
      }
      aircraft.visual.setPosition(aircraft.x, aircraft.y * GAME_CONFIG.map.projectionYScale)
        .setRotation(aircraft.heading)
        .setAlpha(0.72 + Math.sin(elapsedSeconds * (index >= GAME_CONFIG.environment.aircraftCount ? 7 : 0.5) + index) * 0.08);
    }
  }

  count() { return this.aircraft.length; }
}
