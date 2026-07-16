import { describe, expect, it } from 'vitest';
import { GraphRouter } from './GraphRouter';

describe('GraphRouter', () => {
  const router = new GraphRouter({ nodes: [
    { id: 'a', x: 0, y: 0, edges: [{ to: 'b', distance: 10, roadId: 'r1' }] },
    { id: 'b', x: 10, y: 0, edges: [{ to: 'c', distance: 10, roadId: 'r1' }] },
    { id: 'c', x: 20, y: 0, edges: [] }
  ] });

  it('encontra o menor caminho dirigido', () => {
    expect(router.route({ x: 0, y: 0 }, { x: 20, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
  });

  it('não inventa caminho contra mão única', () => {
    expect(router.route({ x: 20, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('inicia adiante do veículo em vez de mandar voltar ao nó mais próximo', () => {
    const route = router.drivingRoute({ x: 4, y: 0 }, { x: 20, y: 0 }, 0);
    expect(route).toEqual([{ x: 10, y: 0 }, { x: 20, y: 0 }]);
  });
});
