import { describe, expect, it } from 'vitest';
import type { RoadData } from '../../types/game';
import { directionalLaneCount } from '../../map/routing/roadRules';
import { selectMergeOwner } from './TrafficMerge';

const road = (lanes: number, oneway: boolean) => ({ lanes, oneway } as RoadData);

describe('convergência de faixas', () => {
  it('calcula a capacidade por sentido antes de um estreitamento', () => {
    expect(directionalLaneCount(road(6, true))).toBe(6);
    expect(directionalLaneCount(road(6, false))).toBe(3);
    expect(directionalLaneCount(road(2, false))).toBe(1);
    expect(directionalLaneCount(undefined)).toBe(1);
  });

  it('mantém a vez do primeiro NPC até ele atravessar o afunilamento', () => {
    expect(selectMergeOwner(undefined, [{ index: 7, remaining: 9 }, { index: 3, remaining: 11 }])).toBe(7);
    expect(selectMergeOwner(7, [{ index: 7, remaining: 8 }, { index: 3, remaining: 6 }])).toBe(7);
    expect(selectMergeOwner(7, [{ index: 3, remaining: 6 }, { index: 9, remaining: 7 }])).toBe(3);
    expect(selectMergeOwner(undefined, [{ index: 2, remaining: 25 }])).toBeNull();
  });
});
