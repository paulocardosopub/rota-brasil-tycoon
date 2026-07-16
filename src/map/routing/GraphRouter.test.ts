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
    expect(router.route({ x: 20, y: 0 }, { x: 0, y: 0 })).toEqual([{ x: 20, y: 0 }, { x: 0, y: 0 }]);
  });
});
