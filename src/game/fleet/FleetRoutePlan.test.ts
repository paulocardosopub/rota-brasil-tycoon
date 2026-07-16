import { describe, expect, it } from 'vitest';
import { buildFleetWaypoints, employeeIdentification, FleetRoutePlan } from './FleetRoutePlan';

describe('rota física do funcionário', () => {
  it('mantém o mesmo destino durante todos os recálculos até a chegada', () => {
    const waypoints = [{ x: 0, y: 0 }, { x: 500, y: 100 }, { x: -300, y: 400 }];
    const plan = new FleetRoutePlan();
    expect(plan.current(waypoints)).toEqual(waypoints[0]);
    expect(plan.current(waypoints)).toEqual(waypoints[0]);
    expect(plan.currentIndex()).toBe(0);
    expect(plan.arrive(waypoints.length)).toBe('to-destination');
    expect(plan.current(waypoints)).toEqual(waypoints[1]);
    expect(plan.arrive(waypoints.length)).toBe('to-pickup');
    expect(plan.current(waypoints)).toEqual(waypoints[2]);
  });

  it('distribui destinos por toda a cidade sem seguir um círculo angular', () => {
    const candidates = Array.from({ length: 120 }, (_, index) => {
      const angle = index / 120 * Math.PI * 2;
      return { x: Math.cos(angle) * 900, y: Math.sin(angle) * 900 };
    });
    const result = buildFleetWaypoints(candidates, [], { x: 0, y: 0 }, 12);
    expect(result).toHaveLength(13);
    const angles = result.slice(1).map((point) => Math.atan2(point.y, point.x));
    const sequentialSmallTurns = angles.slice(1).filter((angle, index) => Math.abs(angle - angles[index]) < 0.4);
    expect(sequentialSmallTurns).toHaveLength(0);
  });

  it('identifica o carro com o nome do motorista', () => {
    expect(employeeIdentification('Bia Rocha')).toBe('Motorista Bia Rocha');
  });
});
