import { describe, expect, it } from 'vitest';
import type { RoadData } from '../../types/game';
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

  it('combina a via real com a região para formar um endereço específico', () => {
    const laneRouter = new GraphRouter({ kind: 'lane', nodes: [
      { id: 'a', x: 0, y: 0, laneId: 'main', edges: [{ to: 'b', distance: 100, roadId: 'road-1', laneId: 'main' }] },
      { id: 'b', x: 100, y: 0, laneId: 'main', edges: [] }
    ] }, [], { 'road-1': 'SQS 308, Via Leste' });

    expect(laneRouter.addressAt({ x: 50, y: 1 }, 'Asa Sul')).toBe('SQS 308, Via Leste, Asa Sul, Brasília, DF');
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

  it('não volta para um trecho atrás do carro quando a faixa correta termina perto de outra', () => {
    const laneRouter = new GraphRouter({ kind: 'lane', nodes: [
      { id: 'a', x: 0, y: 0, laneId: 'correct', edges: [{ to: 'b', distance: 10, roadId: 'correct', laneId: 'correct' }] },
      { id: 'b', x: -10, y: 0, laneId: 'correct', edges: [] },
      { id: 'c', x: -3, y: 1, laneId: 'nearby', edges: [{ to: 'd', distance: 1, roadId: 'nearby', laneId: 'nearby' }] },
      { id: 'd', x: -4, y: 1, laneId: 'nearby', edges: [{ to: 'e', distance: 9, roadId: 'nearby', laneId: 'nearby' }] },
      { id: 'e', x: -4, y: 10, laneId: 'nearby', edges: [{ to: 'g', distance: 16, roadId: 'nearby', laneId: 'nearby' }] },
      { id: 'g', x: -20, y: 10, laneId: 'nearby', edges: [] }
    ] });

    const route = laneRouter.drivingRoute({ x: -5, y: 0 }, { x: -20, y: 10 }, Math.PI);
    expect(route[1]?.x).toBeLessThanOrEqual(-5);
  });

  it('não liga uma rua fora do grafo a uma avenida paralela atravessando a grama', () => {
    const roadPoint = (x: number, y: number, nodeId: string) => ({ x, y, lat: 0, lon: 0, nodeId });
    const roads: RoadData[] = [
      { id: 'local', name: 'Rua local', highway: 'residential', oneway: false, lanes: 2, width: 7, points: [roadPoint(0, 0, 'l0'), roadPoint(100, 0, 'l1')] },
      { id: 'main', name: 'Avenida', highway: 'primary', oneway: true, lanes: 2, width: 7, points: [roadPoint(0, 10, 'm0'), roadPoint(100, 10, 'm1')] }
    ];
    const laneRouter = new GraphRouter({ kind: 'lane', nodes: [
      { id: 'a', x: 0, y: 10, laneId: 'main', edges: [{ to: 'b', distance: 100, roadId: 'main', laneId: 'main' }] },
      { id: 'b', x: 100, y: 10, laneId: 'main', edges: [] }
    ] }, roads);

    expect(laneRouter.drivingRoute({ x: 0, y: 0 }, { x: 90, y: 10 }, 0)).toEqual([]);
    expect(laneRouter.routeStart({ x: 0, y: 0 }, 0)).toBeNull();
    expect(laneRouter.nearestRoutePoint({ x: 0, y: 0 })).toEqual({ x: 0, y: 10 });
  });
});
