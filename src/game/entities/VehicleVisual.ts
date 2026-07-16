import Phaser from 'phaser';

export function createCarVisual(scene: Phaser.Scene, color: number, worn = false) {
  const container = scene.add.container(0, 0);
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x07111a, 0.28).fillEllipse(0.8, 1.1, 6.2, 3.2);

  const car = scene.add.graphics();
  car.fillStyle(0x111827).fillRoundedRect(-2.6, -1.85, 1.2, 0.65, 0.18);
  car.fillRoundedRect(-2.6, 1.2, 1.2, 0.65, 0.18);
  car.fillRoundedRect(1.4, -1.85, 1.2, 0.65, 0.18);
  car.fillRoundedRect(1.4, 1.2, 1.2, 0.65, 0.18);
  car.fillStyle(color).fillRoundedRect(-3.15, -1.55, 6.3, 3.1, 0.75);
  car.lineStyle(0.18, 0x0b1724, 0.9).strokeRoundedRect(-3.15, -1.55, 6.3, 3.1, 0.75);
  car.fillStyle(0x9ed8e7).fillPoints([
    new Phaser.Math.Vector2(-1.45, -1.22), new Phaser.Math.Vector2(1.15, -1.22),
    new Phaser.Math.Vector2(1.45, -0.66), new Phaser.Math.Vector2(-1.7, -0.66)
  ], true);
  car.fillStyle(0x6aa7ba).fillPoints([
    new Phaser.Math.Vector2(-1.7, 0.66), new Phaser.Math.Vector2(1.45, 0.66),
    new Phaser.Math.Vector2(1.15, 1.22), new Phaser.Math.Vector2(-1.45, 1.22)
  ], true);
  car.fillStyle(0xfff1b8).fillCircle(2.75, -0.87, 0.28).fillCircle(2.75, 0.87, 0.28);
  car.fillStyle(0xd83b3b).fillCircle(-2.75, -0.87, 0.24).fillCircle(-2.75, 0.87, 0.24);
  if (worn) {
    car.fillStyle(0x8a4928, 0.9).fillCircle(-2.1, 1.25, 0.28).fillCircle(1.75, -1.35, 0.2);
    car.lineStyle(0.12, 0xf3d19c, 0.65).lineBetween(-0.4, -1.48, 0.6, -1.48);
  }
  container.add([shadow, car]);
  container.setDepth(30);
  return container;
}

export function createPassengerVisual(scene: Phaser.Scene, color = 0x17b890) {
  const container = scene.add.container(0, 0);
  const person = scene.add.graphics();
  person.fillStyle(0x37251c).fillCircle(0, -2.5, 0.78);
  person.fillStyle(color).fillRoundedRect(-0.85, -1.7, 1.7, 2.45, 0.45);
  person.lineStyle(0.42, 0x25364a).lineBetween(-0.45, 0.55, -0.65, 2.15).lineBetween(0.45, 0.55, 0.65, 2.15);
  person.lineStyle(0.35, 0x9b6f52).lineBetween(-0.78, -1.2, -1.3, 0.15).lineBetween(0.78, -1.2, 1.3, 0.15);
  const marker = scene.add.graphics();
  marker.fillStyle(0xffc857, 0.95).fillCircle(0, -8.3, 2.3);
  marker.fillStyle(0x102a43).fillTriangle(-0.8, -6.6, 0.8, -6.6, 0, -4.8);
  marker.fillStyle(0x102a43).fillCircle(0, -8.3, 0.8);
  container.add([person, marker]);
  container.setDepth(28);
  return container;
}
