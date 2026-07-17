import { describe, expect, it } from 'vitest';
import type { RoadPoint } from '../../types/game';
import { buildLaneGraph, canonicalizeRoads, chunkIdFor, type RawRoadSpec } from './RoadPipeline';

const point = (id: string, x: number, y: number): RoadPoint => ({ nodeId: id, x, y, lat: 0, lon: 0 });

describe('pipeline viário 0.7', () => {
  it('propaga faixas e largura pelo corredor quando um fragmento perde as tags', () => {
    const raw: RawRoadSpec[] = [
      { id: 'a', points: [point('1', 0, 0), point('2', 100, 0)], tags: { highway: 'primary', name: 'Eixo', lanes: '4', width: '14' } },
      { id: 'b', points: [point('2', 100, 0), point('3', 150, 0)], tags: { highway: 'primary', name: 'Eixo' } }
    ];
    const roads = canonicalizeRoads(raw);
    expect(roads[1].lanes).toBe(4);
    expect(roads[1].width).toBe(14);
    expect(roads[1].lanesForward).toBe(2);
    expect(roads[1].lanesBackward).toBe(2);
  });

  it('normaliza oneway=-1 e nunca cria faixa no sentido contrário', () => {
    const [road] = canonicalizeRoads([{
      id: 'one', points: [point('start', 0, 0), point('end', 50, 0)],
      tags: { highway: 'primary', oneway: '-1', lanes: '2' }
    }]);
    expect(road.points[0].nodeId).toBe('end');
    expect(road.oneway).toBe(true);
    expect(road.lanesBackward).toBe(0);
    expect(buildLaneGraph([road]).lanes.every((lane) => lane.direction === 'forward')).toBe(true);
  });

  it('gera IDs estáveis de chunk e preserva uma rede dirigida com retorno', () => {
    const raw: RawRoadSpec[] = [
      ['a', 'n1', 'n2', 0, 0, 100, 0],
      ['b', 'n2', 'n3', 100, 0, 100, 100],
      ['c', 'n3', 'n4', 100, 100, 0, 100],
      ['d', 'n4', 'n1', 0, 100, 0, 0]
    ].map(([id, from, to, x1, y1, x2, y2]) => ({
      id: String(id),
      points: [point(String(from), Number(x1), Number(y1)), point(String(to), Number(x2), Number(y2))],
      tags: { highway: 'primary', oneway: 'yes', lanes: '2' }
    }));
    const result = buildLaneGraph(canonicalizeRoads(raw));
    expect(result.graph.kind).toBe('lane');
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(8);
    expect(result.graph.nodes.every((node) => node.edges.length > 0)).toBe(true);
    expect(chunkIdFor({ x: -1, y: 801 }, 800)).toBe('-1_1');
  });

  it('não funde como cruzamento vias em layers diferentes', () => {
    const roads = canonicalizeRoads([
      { id: 'ground', points: [point('g1', -50, 0), point('cross', 0, 0), point('g2', 50, 0)], tags: { highway: 'primary', oneway: 'yes', layer: '0' } },
      { id: 'bridge', points: [point('b1', 0, -50), point('cross', 0, 0), point('b2', 0, 50)], tags: { highway: 'primary', oneway: 'yes', bridge: 'yes', layer: '1' } }
    ]);
    const { graph } = buildLaneGraph(roads);
    const groundNodes = graph.nodes.filter((node) => node.roadSegmentId === 'ground');
    expect(groundNodes.flatMap((node) => node.edges).some((edge) => edge.roadId === 'bridge')).toBe(false);
  });
});
