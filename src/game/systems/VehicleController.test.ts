import { describe, expect, it } from 'vitest';
import type { RoadData } from '../../types/game';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';
import { VehicleController } from './VehicleController';

const road: RoadData = {
  id: 'test-road', name: 'Pista de teste', highway: 'residential', oneway: false, lanes: 2, width: 10,
  points: [
    { x: -100, y: 0, lat: 0, lon: 0, nodeId: 'a' },
    { x: 100, y: 0, lat: 0, lon: 0, nodeId: 'b' }
  ]
};

describe('VehicleController', () => {
  it('acelera em metros por segundo e consome combustível', () => {
    const vehicle = new VehicleController({ x: 0, y: 0 }, 0, new RoadSurfaceIndex([road]));
    for (let frame = 0; frame < 60; frame += 1) vehicle.update({ throttle: 1, steering: 0, handbrake: false }, 1 / 60, 18);
    expect(vehicle.speed).toBeGreaterThan(6);
    expect(vehicle.position.x).toBeGreaterThan(3);
    expect(vehicle.fuelUsed).toBeGreaterThan(0);
  });

  it('impede que o carro atravesse para fora da pista', () => {
    const vehicle = new VehicleController({ x: 0, y: 0 }, Math.PI / 2, new RoadSurfaceIndex([road]));
    vehicle.speed = 15;
    for (let frame = 0; frame < 60; frame += 1) vehicle.update({ throttle: 0, steering: 0, handbrake: false }, 1 / 60, 18);
    expect(Math.abs(vehicle.position.y)).toBeLessThan(4.2);
    expect(vehicle.speed).toBeGreaterThanOrEqual(0);
  });

  it('alinha e centraliza o carro na via ao carregar', () => {
    const diagonal: RoadData = {
      ...road,
      points: [
        { x: -100, y: -100, lat: 0, lon: 0, nodeId: 'a' },
        { x: 100, y: 100, lat: 0, lon: 0, nodeId: 'b' }
      ]
    };
    const vehicle = new VehicleController({ x: 3, y: -3 }, 0, new RoadSurfaceIndex([diagonal]));
    expect(vehicle.alignToRoad(true)).toBe(true);
    expect(Math.abs(vehicle.position.x - vehicle.position.y)).toBeLessThan(0.01);
    expect(Math.abs(Math.sin(vehicle.rotation - Math.PI / 4))).toBeLessThan(0.01);
  });
});
