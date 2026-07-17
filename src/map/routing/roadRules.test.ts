import { describe, expect, it } from 'vitest';
import type { RoadData } from '../../types/game';
import { isDrivableRoad, pointInTrafficLane, rightHandLaneOffset } from './roadRules';

const road = (overrides: Partial<RoadData> = {}): RoadData => ({
  id: 'r1',
  name: 'Avenida',
  highway: 'primary',
  oneway: false,
  lanes: 2,
  width: 10,
  points: [],
  ...overrides
});

describe('regras viárias', () => {
  it('separa ida e volta no lado direito de cada sentido', () => {
    const eastbound = pointInTrafficLane({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, road());
    const westbound = pointInTrafficLane({ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, road());
    expect(eastbound.y).toBeGreaterThan(0);
    expect(westbound.y).toBeLessThan(0);
    expect(eastbound.y).toBeCloseTo(-westbound.y);
  });

  it('distribui veículos em faixas distintas de uma mão única', () => {
    const avenue = road({ oneway: true, lanes: 3, width: 12 });
    expect(rightHandLaneOffset(avenue, 0)).toBe(4);
    expect(rightHandLaneOffset(avenue, 1)).toBe(0);
    expect(rightHandLaneOffset(avenue, 2)).toBe(-4);
    expect(rightHandLaneOffset(avenue, 0)).toBeGreaterThan(rightHandLaneOffset(avenue, 1));
    expect(rightHandLaneOffset(avenue, 1)).toBeGreaterThan(rightHandLaneOffset(avenue, 2));
  });

  it('mantém as faixas de uma via assimétrica dentro da largura total', () => {
    const avenue = road({ lanes: 5, width: 15, lanesForward: 3, lanesBackward: 2 });
    expect(rightHandLaneOffset(avenue, 0)).toBe(6);
    expect(rightHandLaneOffset(avenue, 1)).toBe(3);
    expect(rightHandLaneOffset(avenue, 2)).toBe(0);
  });

  it('remove vias de pedestres do grafo de veículos', () => {
    expect(isDrivableRoad(road({ highway: 'pedestrian' }))).toBe(false);
    expect(isDrivableRoad(road({ highway: 'primary' }))).toBe(true);
  });
});
