import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import type { RoadData } from '../../types/game';
import { MissionSystem } from '../missions/MissionSystem';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';
import { automaticThrottle } from './Autopilot';
import { guidanceForRoute } from './RouteSteeringAssist';
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

  it('aplica o consumo adicional do Modo Sport sem alterar o limite físico', () => {
    const surface = new RoadSurfaceIndex([road]);
    const normal = new VehicleController({ x: -80, y: 2.5 }, 0, surface);
    const sport = new VehicleController({ x: -80, y: -2.5 }, 0, surface);
    for (let frame = 0; frame < 180; frame += 1) {
      normal.update({ throttle: 1, steering: 0, handbrake: false }, 1 / 60, 18);
      sport.update({ throttle: 1, steering: 0, handbrake: false, fuelConsumptionMultiplier: GAME_CONFIG.vehicle.autopilotSportFuelMultiplier }, 1 / 60, 18);
    }
    expect(sport.maximumSpeedMps()).toBe(normal.maximumSpeedMps());
    expect(sport.fuelUsed).toBeGreaterThan(normal.fuelUsed * 1.17);
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

  it('distingue o sentido de avenidas paralelas de mão única', () => {
    const eastbound: RoadData = {
      ...road, id: 'eastbound', oneway: true, lanes: 1, width: 4.5,
      points: [
        { x: -100, y: 0, lat: 0, lon: 0, nodeId: 'e0' },
        { x: 100, y: 0, lat: 0, lon: 0, nodeId: 'e1' }
      ]
    };
    const westbound: RoadData = {
      ...road, id: 'westbound', oneway: true, lanes: 1, width: 4.5,
      points: [
        { x: 100, y: 6, lat: 0, lon: 0, nodeId: 'w0' },
        { x: -100, y: 6, lat: 0, lon: 0, nodeId: 'w1' }
      ]
    };
    const surface = new RoadSurfaceIndex([eastbound, westbound]);
    expect(surface.nearestRoad({ x: 0, y: 3 }, 0)?.roadId).toBe('eastbound');
    expect(surface.nearestRoad({ x: 0, y: 3 }, Math.PI)?.roadId).toBe('westbound');
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

  it('conclui uma curva automática fechada sem criar uma barreira na borda da rua', () => {
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
    const progress = Object.create(MissionSystem.prototype) as MissionSystem;
    progress.route = [{ x: 0, y: 2.5 }, { x: 28.75, y: 1.25 }, { x: 27.5, y: 30 }];
    vehicle.speed = 16;
    let minimumClearance = Number.POSITIVE_INFINITY;
    for (let frame = 0; frame < 360 && vehicle.position.y < 16; frame += 1) {
      const guidance = guidanceForRoute(vehicle.position, vehicle.rotation, vehicle.speed, progress.route);
      vehicle.update({
        throttle: automaticThrottle(vehicle.speed, guidance.targetSpeedMps),
        steering: guidance.steering,
        handbrake: false,
        assistanceEnabled: true,
        assistanceHeading: guidance.preferredRoadHeading,
        assistanceRoadAnchor: guidance.roadAnchor
      }, 1 / 60, 18);
      progress.advanceRoute(vehicle.position);
      minimumClearance = Math.min(minimumClearance, vehicle.roadEdgeClearance());
    }
    expect(vehicle.position.y).toBeGreaterThan(12);
    expect(minimumClearance).toBeGreaterThan(-2.5);
    expect(vehicle.minimumAutopilotRoadClearance).toBeGreaterThan(-2.5);
  });

  it('atravessa uma pequena falha do mapa mantendo o corredor da rota', () => {
    const approach: RoadData = {
      ...road,
      id: 'approach',
      points: [
        { x: 0, y: 0, lat: 0, lon: 0, nodeId: 'a' },
        { x: 20, y: 0, lat: 0, lon: 0, nodeId: 'b' }
      ]
    };
    const exit: RoadData = {
      ...road,
      id: 'exit',
      points: [
        { x: 35, y: 0, lat: 0, lon: 0, nodeId: 'c' },
        { x: 35, y: 40, lat: 0, lon: 0, nodeId: 'd' }
      ]
    };
    const vehicle = new VehicleController({ x: 0, y: 2.5 }, 0, new RoadSurfaceIndex([approach, exit]));
    const progress = Object.create(MissionSystem.prototype) as MissionSystem;
    progress.route = [{ x: 0, y: 2.5 }, { x: 20, y: 2.5 }, { x: 32.5, y: 0 }, { x: 32.5, y: 35 }];
    vehicle.speed = 14;
    let leftAsphalt = false;
    for (let frame = 0; frame < 720 && vehicle.position.y < 15; frame += 1) {
      const guidance = guidanceForRoute(vehicle.position, vehicle.rotation, vehicle.speed, progress.route);
      vehicle.update({
        throttle: automaticThrottle(vehicle.speed, guidance.targetSpeedMps),
        steering: guidance.steering,
        handbrake: false,
        assistanceEnabled: true,
        assistanceHeading: guidance.preferredRoadHeading,
        assistanceRoadAnchor: guidance.roadAnchor
      }, 1 / 60, 18);
      progress.advanceRoute(vehicle.position);
      leftAsphalt ||= vehicle.roadEdgeClearance(guidance.preferredRoadHeading) < 0;
    }
    expect(leftAsphalt).toBe(true);
    expect(vehicle.position.y).toBeGreaterThan(12);
    expect(vehicle.position.x).toBeGreaterThan(29);
  });
});
