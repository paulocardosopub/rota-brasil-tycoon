import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import type { RoadData } from '../../types/game';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';
import { steeringForRoute } from './RouteSteeringAssist';
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

  it('reduz a velocidade fora do asfalto sem criar uma trava', () => {
    const vehicle = new VehicleController({ x: 0, y: 0 }, Math.PI / 2, new RoadSurfaceIndex([road]));
    vehicle.speed = 15;
    for (let frame = 0; frame < 60; frame += 1) vehicle.update({ throttle: 0, steering: 0, handbrake: false }, 1 / 60, 18);
    expect(Math.abs(vehicle.position.y)).toBeGreaterThan(4.2);
    expect(vehicle.speed).toBeGreaterThan(0);
    expect(vehicle.speed).toBeLessThan(15);
  });

  it('alinha o carro na faixa correta ao carregar', () => {
    const diagonal: RoadData = {
      ...road,
      points: [
        { x: -100, y: -100, lat: 0, lon: 0, nodeId: 'a' },
        { x: 100, y: 100, lat: 0, lon: 0, nodeId: 'b' }
      ]
    };
    const vehicle = new VehicleController({ x: 3, y: -3 }, 0, new RoadSurfaceIndex([diagonal]));
    expect(vehicle.alignToRoad(true)).toBe(true);
    expect(Math.abs(vehicle.position.x - vehicle.position.y) / Math.SQRT2).toBeCloseTo(2.5);
    expect(vehicle.position.y).toBeGreaterThan(vehicle.position.x);
    expect(Math.abs(Math.sin(vehicle.rotation - Math.PI / 4))).toBeLessThan(0.01);
  });

  it('atravessa cruzamentos sem criar barreira invisível', () => {
    const crossing: RoadData = {
      ...road,
      id: 'crossing',
      points: [
        { x: 0, y: -30, lat: 0, lon: 0, nodeId: 'c' },
        { x: 0, y: 30, lat: 0, lon: 0, nodeId: 'd' }
      ]
    };
    const vehicle = new VehicleController({ x: -20, y: 2.5 }, 0, new RoadSurfaceIndex([road, crossing]));
    vehicle.speed = 8;
    for (let frame = 0; frame < 240; frame += 1) {
      vehicle.update({ throttle: 0, steering: 0, handbrake: false }, 1 / 60, 18);
    }
    expect(vehicle.position.x).toBeGreaterThan(6.5);
    expect(Math.abs(vehicle.position.y)).toBeLessThan(4.2);
  });

  it('permite trocar de faixa manualmente sem correção lateral', () => {
    const avenue: RoadData = { ...road, lanes: 4, width: 18 };
    const vehicle = new VehicleController({ x: 0, y: 6.75 }, 0, new RoadSurfaceIndex([avenue]));
    vehicle.speed = 10;
    for (let frame = 0; frame < 30; frame += 1) {
      vehicle.update({ throttle: 0, steering: -1, handbrake: false }, 1 / 60, 18);
    }
    expect(vehicle.position.y).toBeLessThan(5.5);
    expect(vehicle.speed).toBeGreaterThan(8);
  });

  it('não corrige o volante escondido no modo manual', () => {
    const vehicle = new VehicleController({ x: 0, y: 0 }, 0.2, new RoadSurfaceIndex([road]));
    vehicle.speed = 6;
    for (let frame = 0; frame < 30; frame += 1) {
      vehicle.update({ throttle: 0, steering: 0, handbrake: false, assistanceEnabled: false }, 1 / 60, 18);
    }
    expect(vehicle.rotation).toBeCloseTo(0.2);
  });

  it('recoloca o carro na faixa ao ligar o piloto automático', () => {
    const surface = new RoadSurfaceIndex([road]);
    const vehicle = new VehicleController({ x: 0, y: 7 }, 0, surface);
    vehicle.speed = 8;
    expect(vehicle.engageAutopilot()).toBe(true);
    expect(vehicle.roadEdgeClearance()).toBeGreaterThan(0);
    expect(vehicle.speed).toBe(8);
  });

  it('recentraliza e volta a andar após um acidente no piloto automático', () => {
    const surface = new RoadSurfaceIndex([road]);
    const vehicle = new VehicleController({ x: 0, y: 4 }, 0.35, surface);
    vehicle.speed = 0;
    expect(vehicle.recoverAutopilotToLane()).toBe(true);
    expect(vehicle.roadEdgeClearance()).toBeGreaterThan(0);
    expect(vehicle.speed).toBe(GAME_CONFIG.vehicle.autopilotRecoverySpeedMps);
  });

  it('mantém todo o carro no asfalto durante uma curva automática fechada', () => {
    const east: RoadData = {
      ...road,
      id: 'east',
      points: [
        { x: 0, y: 0, lat: 0, lon: 0, nodeId: 'a' },
        { x: 30, y: 0, lat: 0, lon: 0, nodeId: 'b' }
      ]
    };
    const north: RoadData = {
      ...road,
      id: 'north',
      points: [
        { x: 30, y: 0, lat: 0, lon: 0, nodeId: 'b' },
        { x: 30, y: 35, lat: 0, lon: 0, nodeId: 'c' }
      ]
    };
    const surface = new RoadSurfaceIndex([east, north]);
    const vehicle = new VehicleController({ x: 0, y: 2.5 }, 0, surface);
    const route = [{ x: 0, y: 2.5 }, { x: 28.75, y: 1.25 }, { x: 27.5, y: 30 }];
    vehicle.speed = 12;
    let minimumClearance = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < 360 && vehicle.position.y < 16; frame += 1) {
      vehicle.update({
        throttle: vehicle.speed < 12 ? 1 : 0,
        steering: steeringForRoute(vehicle.position, vehicle.rotation, vehicle.speed, route),
        handbrake: false,
        assistanceEnabled: true
      }, 1 / 60, 18);
      minimumClearance = Math.min(minimumClearance, vehicle.roadEdgeClearance());
    }
    expect(vehicle.position.y).toBeGreaterThan(12);
    expect(minimumClearance).toBeGreaterThanOrEqual(-0.001);
    expect(vehicle.minimumAutopilotRoadClearance).toBeGreaterThanOrEqual(-0.001);
  });
});
