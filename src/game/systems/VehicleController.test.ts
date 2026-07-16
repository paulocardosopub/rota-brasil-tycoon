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
    expect(vehicle.speed).toBeGreaterThan(3);
    expect(vehicle.position.x).toBeGreaterThan(1);
    expect(vehicle.fuelUsed).toBeGreaterThan(0);
  });

  it('impede que o carro atravesse para fora da pista', () => {
    const vehicle = new VehicleController({ x: 0, y: 0 }, Math.PI / 2, new RoadSurfaceIndex([road]));
    vehicle.speed = 15;
    for (let frame = 0; frame < 60; frame += 1) vehicle.update({ throttle: 0, steering: 0, handbrake: false }, 1 / 60, 18);
    expect(Math.abs(vehicle.position.y)).toBeLessThan(8);
  });
});
