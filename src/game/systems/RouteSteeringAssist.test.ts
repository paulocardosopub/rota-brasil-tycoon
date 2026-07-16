import { describe, expect, it } from 'vitest';
import { guidanceForRoute, steeringForRoute } from './RouteSteeringAssist';

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
});
