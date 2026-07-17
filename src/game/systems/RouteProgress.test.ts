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

  it('encerra o trecho final sem manter um segmento duplicado no GPS do jogador', () => {
    const progress = advanceActiveRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 10, y: 0 });
    expect(progress.route).toEqual([{ x: 10, y: 0 }]);
    expect(progress.remainingMeters).toBe(0);
  });

  it('não pula para um trecho futuro quando a rota cruza perto do carro', () => {
    const progress = advanceActiveRoute([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: -100 },
      { x: 50, y: -100 },
      { x: 50, y: 100 }
    ], { x: 50, y: 1 });

    expect(progress.route[0]).toEqual({ x: 50, y: 0 });
    expect(progress.route[1]).toEqual({ x: 100, y: 0 });
  });

  it('avança normalmente para o próximo segmento depois de alcançar a esquina', () => {
    const progress = advanceActiveRoute(
      [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }],
      { x: 20, y: 8 }
    );
    expect(progress.route).toEqual([{ x: 20, y: 8 }, { x: 20, y: 20 }]);
  });
});
