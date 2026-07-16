import { describe, expect, it } from 'vitest';
import { advanceActiveRoute, pointAlongRoute } from './RouteProgress';

describe('progresso compartilhado de rota', () => {
  it('avança pelo segmento, mesmo longe dos pontos extremos', () => {
    const progress = advanceActiveRoute(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      { x: 60, y: 2 }
    );
    expect(progress.deviationMeters).toBeCloseTo(2);
    expect(progress.route[0]).toEqual({ x: 60, y: 0 });
    expect(progress.remainingMeters).toBeCloseTo(142);
  });

  it('fornece um ponto seguro adiante na rota', () => {
    expect(pointAlongRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }], 15))
      .toEqual({ x: 10, y: 5 });
  });
});
