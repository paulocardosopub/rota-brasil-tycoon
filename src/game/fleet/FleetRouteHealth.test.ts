import { describe, expect, it } from 'vitest';
import { FleetRouteHealth } from './FleetRouteHealth';

describe('saúde da rota física da frota', () => {
  it('não interfere enquanto o veículo progride', () => {
    const health = new FleetRouteHealth();
    health.reset(500, 0);
    for (let frame = 0; frame < 600; frame += 1) {
      const request = health.update({
        deltaSeconds: 1 / 30,
        deviationMeters: 1,
        remainingMeters: 500 - frame * 0.2,
        rotation: Math.sin(frame / 80) * 0.4,
        speedMps: 7,
        shouldBeMoving: true
      });
      expect(request).toBeNull();
    }
  });

  it('detecta uma volta completa sem avanço e escala a segunda recuperação', () => {
    const health = new FleetRouteHealth();
    health.reset(400, 0);
    let first = null;
    for (let frame = 0; frame < 300 && !first; frame += 1) {
      first = health.update({
        deltaSeconds: 1 / 30,
        deviationMeters: 4,
        remainingMeters: 400,
        rotation: frame / 300 * Math.PI * 2,
        speedMps: 6,
        shouldBeMoving: true
      });
    }
    expect(first).toEqual({ reason: 'orbit', repositionAhead: false });

    let second = null;
    for (let frame = 0; frame < 300 && !second; frame += 1) {
      second = health.update({
        deltaSeconds: 1 / 30,
        deviationMeters: 4,
        remainingMeters: 400,
        rotation: frame / 300 * Math.PI * 2,
        speedMps: 6,
        shouldBeMoving: true
      });
    }
    expect(second).toEqual({ reason: 'orbit', repositionAhead: true });
  });

  it('não considera uma fila parada como órbita', () => {
    const health = new FleetRouteHealth();
    health.reset(200, 0);
    for (let frame = 0; frame < 900; frame += 1) {
      expect(health.update({
        deltaSeconds: 1 / 30,
        deviationMeters: 2,
        remainingMeters: 200,
        rotation: 0,
        speedMps: 0,
        shouldBeMoving: false
      })).toBeNull();
    }
  });
});
