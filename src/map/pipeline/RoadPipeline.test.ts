import { describe, expect, it } from 'vitest';
import type { RoadPoint } from '../../types/game';
import { buildLaneGraph, canonicalizeRoads, chunkIdFor, type RawRoadSpec } from './RoadPipeline';

const point = (id: string, x: number, y: number): RoadPoint => ({ nodeId: id, x, y, lat: 0, lon: 0 });

describe('inferência de faixas ausentes', () => {
  it('não transforma vias de mão dupla sem tag em avenidas de quatro faixas', () => {
    const roads = canonicalizeRoads([
      { id: 'primary', points: [point('p0', 0, 0), point('p1', 100, 0)], tags: { highway: 'primary' } },
      { id: 'secondary', points: [point('s0', 0, 20), point('s1', 100, 20)], tags: { highway: 'secondary' } },
      { id: 'living', points: [point('l0', 0, 40), point('l1', 100, 40)], tags: { highway: 'living_street' } }
    ]);

    expect(roads.map((road) => road.lanes)).toEqual([2, 2, 2]);
    expect(roads.map((road) => road.width)).toEqual([6.7, 6.7, 6.7]);
    expect(roads.every((road) => road.lanesForward === 1 && road.lanesBackward === 1)).toBe(true);
  });

  it('mantém uma via expressa de mão única com três faixas por padrão', () => {
    const [road] = canonicalizeRoads([{
      id: 'expressway', points: [point('e0', 0, 0), point('e1', 100, 0)],
      tags: { highway: 'motorway', oneway: 'yes' }
    }]);

    expect(road.lanes).toBe(3);
    expect(road.lanesForward).toBe(3);
    expect(road.lanesBackward).toBe(0);
  });
});

describe('transições em entroncamentos', () => {
  it('reduz gradualmente a avenida antes de um acesso estreito e uma rotatória', () => {
    const roads = canonicalizeRoads([
      { id: 'avenue', points: [point('a0', 0, 0), point('join', 120, 0)], tags: { highway: 'primary', name: 'Avenida', lanes: '4' } },
      { id: 'link', points: [point('join', 120, 0), point('round', 240, 0)], tags: { highway: 'primary_link', oneway: 'yes', lanes: '1' } },
      { id: 'roundabout', points: [point('round', 240, 0), point('r1', 260, 20), point('r2', 240, 40), point('round', 240, 0)], tags: { highway: 'primary', junction: 'roundabout', lanes: '2' } }
    ]);
    const avenue = roads.find((road) => road.id === 'avenue')!;

    expect(avenue.widthProfile?.[0]).toBeCloseTo(13.4);
    expect(avenue.widthProfile?.at(-1)).toBeCloseTo(8.4);
    expect(avenue.widthProfile?.length).toBe(avenue.points.length);
    expect(Math.min(...avenue.widthProfile!)).toBeGreaterThanOrEqual(avenue.lanes * 2.1);
    for (let index = 1; index < avenue.points.length; index += 1) {
      const segmentLength = Math.hypot(
        avenue.points[index].x - avenue.points[index - 1].x,
        avenue.points[index].y - avenue.points[index - 1].y
      );
      expect(Math.abs(avenue.widthProfile![index] - avenue.widthProfile![index - 1]) / segmentLength).toBeLessThanOrEqual(0.121);
    }
  });

  it('não alarga uma rua perpendicular em um cruzamento com avenida', () => {
    const roads = canonicalizeRoads([
      { id: 'avenue-west', points: [point('w', -100, 0), point('cross', 0, 0)], tags: { highway: 'primary', lanes: '4' } },
      { id: 'avenue-east', points: [point('cross', 0, 0), point('e', 100, 0)], tags: { highway: 'primary', lanes: '4' } },
      { id: 'side', points: [point('s', 0, -100), point('cross', 0, 0)], tags: { highway: 'residential', lanes: '2' } }
    ]);
    const side = roads.find((road) => road.id === 'side')!;

    expect(side.widthProfile).toBeUndefined();
  });

  it('preserva a emenda de dois fragmentos da mesma avenida', () => {
    const roads = canonicalizeRoads([
      { id: 'avenue-a', points: [point('a', 0, 0), point('join', 100, 0)], tags: { highway: 'primary', name: 'Avenida Contínua', lanes: '4' } },
      { id: 'avenue-b', points: [point('join', 100, 0), point('b', 200, 0)], tags: { highway: 'primary', name: 'Avenida Contínua', lanes: '4' } },
      { id: 'access', points: [point('join', 100, 0), point('c', 160, 20)], tags: { highway: 'primary_link', oneway: 'yes', lanes: '1' } }
    ]);
    const first = roads.find((road) => road.id === 'avenue-a')!;
    const second = roads.find((road) => road.id === 'avenue-b')!;

    expect(first.widthProfile?.at(-1) ?? first.width).toBeCloseTo(second.widthProfile?.[0] ?? second.width);
  });
});

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

  it('elimina oscilacao curta 4 -> 6 -> 4 mesmo quando o fragmento traz faixa de conversao', () => {
    const roads = canonicalizeRoads([
      { id: 'before', points: [point('n0', 0, 0), point('n1', 120, 0)], tags: { highway: 'primary', name: 'Avenida Continua', lanes: '4' } },
      { id: 'noise', points: [point('n1', 120, 0), point('n2', 180, 0)], tags: { highway: 'primary', name: 'Avenida Continua', lanes: '6', 'turn:lanes:forward': 'left|through|through' } },
      { id: 'after', points: [point('n2', 180, 0), point('n3', 320, 0)], tags: { highway: 'primary', name: 'Avenida Continua', lanes: '4' } }
    ]);
    expect(roads.map((road) => road.lanes)).toEqual([4, 4, 4]);
    expect(roads[1].width).toBeCloseTo(13.4);
  });

  it('preserva mudanca longa legitima com transicao gradual compartilhada', () => {
    const roads = canonicalizeRoads([
      { id: 'four', points: [point('n0', 0, 0), point('join', 120, 0)], tags: { highway: 'primary', name: 'Avenida Continua', lanes: '4' } },
      { id: 'six', points: [point('join', 120, 0), point('n2', 520, 0)], tags: { highway: 'primary', name: 'Avenida Continua', lanes: '6' } }
    ]);
    expect(roads[1].lanes).toBe(6);
    expect(roads[1].widthProfile?.[0]).toBeCloseTo(roads[0].widthProfile?.at(-1) ?? 0);
    expect(roads[1].widthProfile?.at(-1)).toBeCloseTo(roads[1].width);
    expect(roads[1].points.length).toBeGreaterThan(2);
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

  it('mantém todas as faixas de avenidas de mão única dentro do asfalto', () => {
    const [road] = canonicalizeRoads([{
      id: 'wide-oneway', points: [point('start', 0, 0), point('end', 100, 0)],
      tags: { highway: 'motorway', oneway: 'yes', lanes: '3', width: '10.05' }
    }]);
    const { lanes } = buildLaneGraph([road]);
    expect(lanes[0].points[0].y).toBeCloseTo(3.35);
    expect(lanes[1].points[0].y).toBeCloseTo(0);
    expect(lanes[2].points[0].y).toBeCloseTo(-3.35);
    expect(lanes.every((lane) => Math.abs(lane.points[0].y) < road.width / 2)).toBe(true);
  });

  it('distribui corredores assimétricos usando a largura total da via', () => {
    const [road] = canonicalizeRoads([{
      id: 'asymmetric', points: [point('start', 0, 0), point('end', 100, 0)],
      tags: { highway: 'primary', lanes: '5', 'lanes:forward': '3', 'lanes:backward': '2', width: '16.75' }
    }]);
    const { lanes } = buildLaneGraph([road]);
    const forward = lanes.filter((lane) => lane.direction === 'forward').map((lane) => lane.points[0].y);
    const backward = lanes.filter((lane) => lane.direction === 'backward').map((lane) => lane.points[0].y);
    expect(forward[0]).toBeCloseTo(6.7);
    expect(forward[1]).toBeCloseTo(3.35);
    expect(forward[2]).toBeCloseTo(0);
    expect(backward[0]).toBeCloseTo(-6.7);
    expect(backward[1]).toBeCloseTo(-3.35);
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

  it('mantém ruas sem saída conectadas ao grafo por um retorno no fim real', () => {
    const raw: RawRoadSpec[] = [
      ['a', 'n1', 'n2', 0, 0, 100, 0, 'yes'],
      ['b', 'n2', 'n3', 100, 0, 100, 100, 'yes'],
      ['c', 'n3', 'n4', 100, 100, 0, 100, 'yes'],
      ['d', 'n4', 'n1', 0, 100, 0, 0, 'yes'],
      ['spur', 'n1', 'dead-end', 0, 0, -70, 0, 'no']
    ].map(([id, from, to, x1, y1, x2, y2, oneway]) => ({
      id: String(id),
      points: [point(String(from), Number(x1), Number(y1)), point(String(to), Number(x2), Number(y2))],
      tags: { highway: 'residential', oneway: String(oneway), lanes: '2' }
    }));
    const { graph } = buildLaneGraph(canonicalizeRoads(raw));
    expect(graph.nodes.some((node) => node.roadSegmentId === 'spur')).toBe(true);
    expect(graph.nodes.filter((node) => node.roadSegmentId === 'spur').every((node) => node.edges.length > 0)).toBe(true);
    const spurReturns = graph.nodes
      .filter((node) => node.roadSegmentId === 'spur')
      .flatMap((node) => node.edges.filter((edge) => edge.connector && edge.roadId === 'spur').map(() => node.sourceNodeId));
    expect(spurReturns).toEqual(['dead-end']);
  });

  it('mantém acessos de mão única ligados à cidade mesmo sem retorno ilegal', () => {
    const raw: RawRoadSpec[] = [
      ['a', 'n1', 'n2', 0, 0, 100, 0],
      ['b', 'n2', 'n3', 100, 0, 100, 100],
      ['c', 'n3', 'n4', 100, 100, 0, 100],
      ['d', 'n4', 'n1', 0, 100, 0, 0],
      ['feeder', 'outside', 'n1', -80, 0, 0, 0]
    ].map(([id, from, to, x1, y1, x2, y2]) => ({
      id: String(id),
      points: [point(String(from), Number(x1), Number(y1)), point(String(to), Number(x2), Number(y2))],
      tags: { highway: 'primary', oneway: 'yes', lanes: '1' }
    }));
    const { graph } = buildLaneGraph(canonicalizeRoads(raw));
    const feeder = graph.nodes.filter((node) => node.roadSegmentId === 'feeder');
    expect(feeder.length).toBe(2);
    expect(feeder.some((node) => node.edges.some((edge) => edge.roadId === 'a'))).toBe(true);
  });

  it('rejeita ganchos obtusos e prefere a saída direta em acessos de avenida', () => {
    const roads = canonicalizeRoads([
      { id: 'incoming', points: [point('in', -100, 0), point('join', 0, 0)], tags: { highway: 'residential', oneway: 'yes', lanes: '1' } },
      { id: 'straight', points: [point('join', 0, 0), point('east', 100, 0)], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } },
      { id: 'right', points: [point('join', 0, 0), point('north', 0, 100)], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } },
      { id: 'hook', points: [point('join', 0, 0), point('back', -80, 40)], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } }
    ]);
    const { graph } = buildLaneGraph(roads);
    const arrival = graph.nodes.find((node) => node.sourceNodeId === 'join' && node.roadSegmentId === 'incoming')!;
    const connectors = arrival.edges.filter((edge) => edge.connector);
    const straight = connectors.find((edge) => edge.roadId === 'straight');
    const right = connectors.find((edge) => edge.roadId === 'right');

    expect(straight).toBeDefined();
    expect(right).toBeDefined();
    expect(connectors.some((edge) => edge.roadId === 'hook')).toBe(false);
    expect(right!.distance).toBeGreaterThan(straight!.distance);
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

  it('liga a mudança de layer somente na cabeceira real de uma ponte', () => {
    const roads = canonicalizeRoads([
      { id: 'approach', points: [point('n0', -100, 0), point('head', 0, 0)], tags: { highway: 'trunk', oneway: 'yes', layer: '0' } },
      { id: 'bridge', points: [point('head', 0, 0), point('end', 100, 0)], tags: { highway: 'trunk', oneway: 'yes', bridge: 'yes', layer: '1' } },
      { id: 'exit', points: [point('end', 100, 0), point('n3', 200, 0)], tags: { highway: 'trunk', oneway: 'yes', layer: '0' } }
    ]);
    const { graph } = buildLaneGraph(roads);
    expect(graph.nodes.filter((node) => node.roadSegmentId === 'approach').flatMap((node) => node.edges)
      .some((edge) => edge.roadId === 'bridge')).toBe(true);
    expect(graph.nodes.filter((node) => node.roadSegmentId === 'bridge').flatMap((node) => node.edges)
      .some((edge) => edge.roadId === 'exit')).toBe(true);
  });
});
