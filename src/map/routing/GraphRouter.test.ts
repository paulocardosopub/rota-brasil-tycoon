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

  it('ancora o piloto no segmento dirigido sob o carro, sem cortar para uma via paralela', () => {
    const laneRouter = new GraphRouter({ kind: 'lane', nodes: [
      { id: 'a', x: 0, y: 0, laneId: 'main', edges: [{ to: 'b', distance: 100, roadId: 'main', laneId: 'main' }] },
      { id: 'b', x: 100, y: 0, laneId: 'main', edges: [{ to: 'c', distance: 100, roadId: 'main', laneId: 'main' }] },
      { id: 'c', x: 200, y: 0, laneId: 'main', edges: [] },
      { id: 'p0', x: 45, y: 8, laneId: 'parallel', edges: [{ to: 'p1', distance: 10, roadId: 'parallel', laneId: 'parallel' }] },
      { id: 'p1', x: 55, y: 8, laneId: 'parallel', edges: [{ to: 'c', distance: 145, roadId: 'parallel', laneId: 'parallel' }] }
    ] });

    expect(laneRouter.drivingRoute({ x: 50, y: 0 }, { x: 150, y: 0 }, 0)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 150, y: 0 }
    ]);
  });

  it('termina na faixa mais próxima sem desenhar um atalho final pela calçada', () => {
    const laneRouter = new GraphRouter({ kind: 'lane', nodes: [
      { id: 'a', x: 0, y: 0, laneId: 'main', edges: [{ to: 'b', distance: 100, roadId: 'main', laneId: 'main' }] },
      { id: 'b', x: 100, y: 0, laneId: 'main', edges: [{ to: 'c', distance: 100, roadId: 'main', laneId: 'main' }] },
      { id: 'c', x: 200, y: 0, laneId: 'main', edges: [] }
    ] });

    const route = laneRouter.drivingRoute({ x: 20, y: 0 }, { x: 150, y: 6 }, 0);
    expect(route[route.length - 1]).toEqual({ x: 150, y: 0 });
  });
});
