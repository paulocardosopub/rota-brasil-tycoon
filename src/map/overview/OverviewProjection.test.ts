import { describe, expect, it } from 'vitest';
import { pointInsideOverview, projectOverviewPoint } from './OverviewProjection';

const bounds = { minX: -100, minY: -50, maxX: 300, maxY: 150 };

describe('projeção do mapa geral', () => {
  it('projeta o centro e respeita a margem da imagem', () => {
    expect(projectOverviewPoint({ x: 100, y: 50 }, bounds)).toEqual({ left: 50, top: 50 });
    expect(projectOverviewPoint({ x: -999, y: 999 }, bounds)).toEqual({ left: 2.64, top: 97.36 });
  });

  it('identifica pontos dentro e fora dos limites de Brasília', () => {
    expect(pointInsideOverview({ x: 0, y: 0 }, bounds)).toBe(true);
    expect(pointInsideOverview({ x: 301, y: 0 }, bounds)).toBe(false);
  });
});
