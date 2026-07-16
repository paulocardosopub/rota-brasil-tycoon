import { describe, expect, it } from 'vitest';
import { steeringForRoute } from './RouteSteeringAssist';

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
});
