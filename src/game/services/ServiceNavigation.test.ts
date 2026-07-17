import { describe, expect, it } from 'vitest';
import { updateServiceNavigation } from './ServiceNavigation';

describe('navegação automática para serviços', () => {
  const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];

  it('recalcula depois de um desvio manual persistente', () => {
    const first = updateServiceNavigation(route, { x: 20, y: 50 }, 1.5, 0, 180, 15);
    const second = updateServiceNavigation(first.route, { x: 30, y: 55 }, 1.1, first.offRouteSeconds, 170, 15);
    expect(second.shouldRecalculate).toBe(true);
  });

  it('não recalcula quando o veículo já entrou no serviço', () => {
    const result = updateServiceNavigation(route, { x: 20, y: 50 }, 3, 0, 10, 15);
    expect(result.shouldRecalculate).toBe(false);
  });
});
