import Phaser from 'phaser';
import type { VehicleModel } from '../../types/game';

export function createCarVisual(scene: Phaser.Scene, color: number, worn = false, taxi = false) {
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
  if (taxi) {
    const taxiSign = scene.add.graphics();
    taxiSign.fillStyle(0xf6d34a, 1).fillRoundedRect(-1.45, -2.25, 2.9, 0.8, 0.25);
    taxiSign.lineStyle(0.16, 0x18232e, 0.9).strokeRoundedRect(-1.45, -2.25, 2.9, 0.8, 0.25);
    taxiSign.fillStyle(0x39d6a6, 0.95).fillCircle(0, -2.55, 0.22);
    container.add(taxiSign);
  }
  container.setDepth(30);
  return container;
}

export function createBusVisual(scene: Phaser.Scene, color = 0x2b7a78) {
  const container = scene.add.container(0, 0);
  const shadow = scene.add.graphics().fillStyle(0x07111a, 0.3).fillEllipse(-0.5, 1.1, 12, 3.9);
  const bus = scene.add.graphics();
  bus.fillStyle(0x111827).fillRoundedRect(-4.9, -2, 1.2, 0.55, 0.15).fillRoundedRect(3.2, -2, 1.2, 0.55, 0.15);
  bus.fillRoundedRect(-4.9, 1.45, 1.2, 0.55, 0.15).fillRoundedRect(3.2, 1.45, 1.2, 0.55, 0.15);
  bus.fillStyle(color).fillRoundedRect(-5.8, -1.72, 11.6, 3.44, 0.7);
  bus.fillStyle(0xe8f4f6).fillRect(-4.5, -1.48, 7.9, 0.72).fillRect(-4.5, 0.76, 7.9, 0.72);
  bus.fillStyle(0x162a3a).fillRoundedRect(3.8, -1.4, 1.4, 2.8, 0.35);
  bus.fillStyle(0xfff1b8).fillCircle(5.35, -1.05, 0.3).fillCircle(5.35, 1.05, 0.3);
  bus.fillStyle(0x162a3a).fillRect(-2.7, -1.5, 0.22, 3).fillRect(-0.5, -1.5, 0.22, 3).fillRect(1.7, -1.5, 0.22, 3);
  container.add([shadow, bus]).setDepth(25);
  return container;
}

export function createUtilityVehicleVisual(scene: Phaser.Scene, color = 0xe8ecef) {
  const container = scene.add.container(0, 0);
  const shadow = scene.add.graphics().fillStyle(0x07111a, 0.28).fillEllipse(-0.2, 1, 8.5, 3.5);
  const van = scene.add.graphics();
  van.fillStyle(0x111827).fillRoundedRect(-3.25, -1.85, 1.05, 0.55, 0.16).fillRoundedRect(2.2, -1.85, 1.05, 0.55, 0.16);
  van.fillRoundedRect(-3.25, 1.3, 1.05, 0.55, 0.16).fillRoundedRect(2.2, 1.3, 1.05, 0.55, 0.16);
  van.fillStyle(color).fillRoundedRect(-4.1, -1.55, 8.2, 3.1, 0.58);
  van.fillStyle(0x82b9c9).fillPoints([
    new Phaser.Math.Vector2(1.45, -1.25), new Phaser.Math.Vector2(3.4, -1.25),
    new Phaser.Math.Vector2(3.55, -0.55), new Phaser.Math.Vector2(1.3, -0.55)
  ], true);
  van.fillStyle(0xffc857).fillRect(-2.7, -0.12, 2.6, 0.24);
  van.fillStyle(0xfff1b8).fillCircle(3.72, -0.9, 0.28).fillCircle(3.72, 0.9, 0.28);
  container.add([shadow, van]).setDepth(25);
  return container;
}

export function createMotorcycleVisual(scene: Phaser.Scene, color = 0x32c48d, cargo = false) {
  const container = scene.add.container(0, 0);
  const shadow = scene.add.graphics().fillStyle(0x07111a, 0.25).fillEllipse(-0.2, 0.8, 5.8, 2.2);
  const bike = scene.add.graphics();
  bike.fillStyle(0x111827).fillCircle(-2.05, 0, 0.82).fillCircle(2.05, 0, 0.82);
  bike.lineStyle(0.35, 0xb8c2cc).strokeCircle(-2.05, 0, 0.55).strokeCircle(2.05, 0, 0.55);
  bike.lineStyle(0.42, color).lineBetween(-1.7, 0, -0.35, -0.7).lineBetween(-0.35, -0.7, 0.75, 0).lineBetween(0.75, 0, -1.05, 0);
  bike.fillStyle(color).fillRoundedRect(-0.7, -1.02, 1.9, 0.62, 0.22);
  bike.fillStyle(0x2a3542).fillRoundedRect(-1.45, -0.85, 1.2, 0.42, 0.18);
  bike.lineStyle(0.3, 0x303b47).lineBetween(0.75, 0, 1.75, -1.25).lineBetween(1.75, -1.25, 2.1, 0);
  bike.fillStyle(0xfff1b8).fillCircle(2.0, -1.28, 0.28);
  const rider = scene.add.graphics();
  rider.fillStyle(0x27384d).fillRoundedRect(-0.55, -2.3, 1.2, 1.5, 0.38);
  rider.fillStyle(0xd69b72).fillCircle(0.12, -2.85, 0.58);
  rider.fillStyle(0x202c39).fillCircle(0.12, -3.05, 0.62);
  container.add([shadow, bike, rider]);
  if (cargo) {
    const box = scene.add.graphics();
    box.fillStyle(0xf2b134).fillRoundedRect(-2.15, -2.45, 1.45, 1.55, 0.2);
    box.lineStyle(0.18, 0x603d10).strokeRoundedRect(-2.15, -2.45, 1.45, 1.55, 0.2);
    container.add(box);
  }
  return container.setDepth(30);
}

export function createFleetVehicleVisual(scene: Phaser.Scene, model: VehicleModel, color: number, taxi = false) {
  if (['Moto Urbana 125','Moto Cargo 160','Scooter Express 150','Triciclo Cargo 200'].includes(model)) {
    return createMotorcycleVisual(scene, color, model !== 'Moto Urbana 125').setScale(model === 'Triciclo Cargo 200' ? 1.15 : 1);
  }
  if (['Furgão Compacto','Van de Carga','Picape Leve','Furgão Médio','Utilitário Baú'].includes(model)) {
    const scale = model === 'Utilitário Baú' ? 1.22 : model === 'Furgão Médio' ? 1.12 : model === 'Van de Carga' ? 1.05 : 0.9;
    return createUtilityVehicleVisual(scene, color).setScale(scale);
  }
  return createCarVisual(scene, color, false, taxi);
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
