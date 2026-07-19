import Phaser from 'phaser';
import type { MapBuilding, MapSignal, Point, WorldClockSnapshot } from '../../types/game';

type Project = (point: Point) => Point;

export class WorldLightingSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private elapsed = 0;

  constructor(scene: Phaser.Scene, private readonly project: Project) {
    this.graphics = scene.add.graphics().setDepth(22).setBlendMode(Phaser.BlendModes.ADD);
  }

  update(deltaSeconds: number, clock: WorldClockSnapshot, player: Point, buildings: readonly MapBuilding[], signals: readonly MapSignal[], reduced: boolean) {
    this.elapsed += deltaSeconds;
    if (this.elapsed < 0.3) return;
    this.elapsed = 0;
    this.graphics.clear();
    if (clock.headlights < 0.03) return;
    const radius = reduced ? 360 : 620;
    const maximumBuildings = reduced ? 24 : 72;
    let drawn = 0;
    for (const building of buildings) {
      if (drawn >= maximumBuildings || !building.points.length || building.id.charCodeAt(building.id.length - 1) % 3 !== 0) continue;
      const center = centroid(building.points);
      if (Math.hypot(center.x - player.x, center.y - player.y) > radius) continue;
      const projected = this.project(center);
      const strength = clock.headlights * Math.min(1, 0.35 + building.levels * 0.08);
      this.graphics.fillStyle(0xffcf72, strength * 0.18).fillCircle(projected.x, projected.y, reduced ? 1.2 : 2.1);
      this.graphics.fillStyle(0xffe7a6, strength * 0.8).fillCircle(projected.x, projected.y, 0.42);
      drawn += 1;
    }
    for (const [index, signal] of signals.entries()) {
      if (index % 2 || Math.hypot(signal.x - player.x, signal.y - player.y) > radius) continue;
      const projected = this.project(signal);
      this.graphics.fillStyle(0xffe7ad, clock.headlights * 0.2).fillCircle(projected.x, projected.y - 5, reduced ? 1 : 1.8);
      this.graphics.fillStyle(0xfff0c8, clock.headlights * 0.9).fillCircle(projected.x, projected.y - 5, 0.35);
    }
  }

  destroy() { this.graphics.destroy(); }
}

function centroid(points: readonly Point[]) {
  const sum = points.reduce((result, point) => ({ x: result.x + point.x, y: result.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
