import { describe, expect, it } from 'vitest';
import { autopilotProfileForVehicle, guidanceForRoute, normalizeRouteNoise, steeringForRoute } from './RouteSteeringAssist';

describe('steeringForRoute', () => {
  it('mantém o volante neutro numa rota reta', () => {
    expect(steeringForRoute({ x: 0, y: 0 }, 0, 8, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBeCloseTo(0);
  });

  it('antecipa uma curva e vira para o lado correto', () => {
    const steering = steeringForRoute(
      { x: 12, y: 0 },
      0,
      8,
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 50 }]
    );
    expect(steering).toBeGreaterThan(0.35);
  });

  it('reduz a velocidade antes de um canto muito acentuado', () => {
    const guidance = guidanceForRoute(
      { x: 10, y: 0 },
      0,
      16,
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }]
    );
    expect(guidance.targetSpeedMps).toBeLessThan(14);
    expect(guidance.preferredRoadHeading).toBeGreaterThan(0);
  });

  it('não salta para um trecho futuro quando a rota cruza a si mesma', () => {
    const steering = steeringForRoute(
      { x: 50, y: 1 },
      0,
      8,
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: -100 },
        { x: 50, y: -100 },
        { x: 50, y: 100 }
      ]
    );
    expect(Math.abs(steering)).toBeLessThan(0.3);
  });

  it('ignora duplicatas, ruído geométrico e emendas de chunk numa reta', () => {
    const route = normalizeRouteNoise([
      { x: 0, y: 0 }, { x: 0.2, y: 0.1 }, { x: 12, y: 0 },
      { x: 12.8, y: 0.18 }, { x: 13.6, y: -0.12 }, { x: 80, y: 0 }
    ]);
    const guidance = guidanceForRoute({ x: 2, y: 0 }, 0, 18, route, 20);
    expect(guidance.curveClass).toBe('straight');
    expect(guidance.targetSpeedMps).toBeGreaterThan(19);
  });

  it('antecipa mais e reduz mais a curva para ônibus do que para carro', () => {
    const route = [{ x: 0, y: 0 }, { x: 35, y: 0 }, { x: 35, y: 45 }];
    const car = guidanceForRoute({ x: 0, y: 0 }, 0, 18, route, 20, 10, autopilotProfileForVehicle('Hatch 1998'));
    const bus = guidanceForRoute({ x: 0, y: 0 }, 0, 18, route, 20, 10, autopilotProfileForVehicle('Ônibus Urbano Convencional'));
    expect(bus.targetSpeedMps).toBeLessThan(car.targetSpeedMps);
  });
});
