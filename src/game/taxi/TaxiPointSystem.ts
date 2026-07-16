import Phaser from 'phaser';
import type { Point, TaxiPoint } from '../../types/game';

type Project = (point: Point) => Point;

export class TaxiPointSystem {
  private readonly visuals: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene, readonly points: TaxiPoint[], project: Project) {
    for (const [index, point] of points.entries()) {
      const projected = project(point.point);
      const container = scene.add.container(projected.x, projected.y).setDepth(17);
      const pad = scene.add.graphics();
      pad.fillStyle(0x0b2233, 0.78).fillRoundedRect(-9, -3, 18, 6, 2);
      pad.lineStyle(0.75, 0xf2c14e, 0.85).strokeRoundedRect(-9, -3, 18, 6, 2);
      pad.fillStyle(0xf2c14e, 0.9).fillRect(-7, -0.6, 14, 1.2);
      const sign = scene.add.graphics();
      sign.lineStyle(0.7, 0x354b5a, 1).lineBetween(0, -3, 0, -10);
      sign.fillStyle(0xf2c14e, 1).fillRoundedRect(-3.2, -14, 6.4, 4.5, 1);
      sign.fillStyle(0x0b2233, 1).fillRect(-1.8, -12.9, 3.6, 0.8);
      const passenger = scene.add.graphics();
      passenger.fillStyle(0x5d3f2f).fillCircle(4 + index % 2 * 2, -6, 0.65);
      passenger.fillStyle(0x35c9a0).fillRoundedRect(3.3 + index % 2 * 2, -5.3, 1.4, 2.3, 0.35);
      container.add([pad, sign, passenger]);
      this.visuals.push(container);
    }
  }

  update(elapsedSeconds: number) {
    this.visuals.forEach((visual, index) => {
      visual.setScale(1 + Math.sin(elapsedSeconds * 1.8 + index) * 0.025);
    });
  }
}
