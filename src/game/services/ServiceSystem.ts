import Phaser from 'phaser';
import { GAME_CONFIG } from '../../config/gameConfig';
import type { MapServiceLocation, Point, ServiceCategory } from '../../types/game';

type Project = (point: Point) => Point;

export class ServiceSystem {
  selected: MapServiceLocation | null = null;
  private readonly visuals: Phaser.GameObjects.Container[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly locations: MapServiceLocation[],
    private readonly project: Project
  ) {
    for (const location of locations) this.visuals.push(this.createVisual(location));
  }

  select(id: string) {
    this.selected = this.locations.find((location) => location.id === id) ?? null;
    return this.selected;
  }

  clearSelection() { this.selected = null; }

  nearest(position: Point, category?: ServiceCategory, radius: number = GAME_CONFIG.services.interactionRadiusMeters) {
    let nearest: MapServiceLocation | null = null;
    let distance = radius;
    for (const location of this.locations) {
      if (category && location.category !== category) continue;
      const nextDistance = Math.hypot(position.x - location.stopPoint.x, position.y - location.stopPoint.y);
      if (nextDistance <= distance) { nearest = location; distance = nextDistance; }
    }
    return nearest;
  }

  nearestAnywhere(position: Point, category: ServiceCategory) {
    return this.nearest(position, category, Number.POSITIVE_INFINITY);
  }

  update(elapsedSeconds: number) {
    this.visuals.forEach((visual, index) => {
      const marker = visual.getByName('service-marker');
      if (marker) (marker as Phaser.GameObjects.Arc).setScale(1 + Math.sin(elapsedSeconds * 2.2 + index) * 0.06);
    });
  }

  private createVisual(location: MapServiceLocation) {
    const point = this.project(location.stopPoint);
    const container = this.scene.add.container(point.x, point.y).setDepth(16);
    const shadow = this.scene.add.ellipse(0, 4, 18, 8, 0x071722, 0.2);
    const graphics = this.scene.add.graphics();
    if (location.category === 'fuel') {
      graphics.fillStyle(0xefe8d2, 1).fillRoundedRect(-9, -8, 18, 8, 2);
      graphics.fillStyle(0x2aa67d, 1).fillRect(-10, -9, 20, 2);
      graphics.fillStyle(0x304b5b, 1).fillRoundedRect(-6, 0, 3, 5, 1).fillRoundedRect(3, 0, 3, 5, 1);
    } else if (location.category === 'workshop') {
      graphics.fillStyle(0x445a68, 1).fillRoundedRect(-10, -7, 20, 12, 2);
      graphics.fillStyle(0xe9b44c, 1).fillRect(-7, -3, 14, 8);
      graphics.lineStyle(1, 0x8b5e20, 0.8).lineBetween(-7, 0, 7, 0);
    } else {
      graphics.fillStyle(0x3f5360, 1).fillRoundedRect(-11, -8, 22, 13, 2);
      graphics.fillStyle(0x86a9b8, 1).fillRect(-8, -3, 16, 8);
      graphics.lineStyle(1, 0x243843, 1).lineBetween(-8, 0, 8, 0);
    }
    const markerColor = location.category === 'fuel' ? 0xf2c14e : location.category === 'workshop' ? 0xff8a55 : 0x65d8ba;
    const marker = this.scene.add.circle(0, -14, 3.2, markerColor, 0.95).setName('service-marker');
    container.add([shadow, graphics, marker]);
    return container;
  }
}
