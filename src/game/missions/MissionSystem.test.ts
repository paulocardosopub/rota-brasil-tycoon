import { describe, expect, it } from 'vitest';
import { isOfficialTaxiRide, MissionSystem } from './MissionSystem';

function missionWithRoute(route: { x: number; y: number }[]) {
  const mission = Object.create(MissionSystem.prototype) as MissionSystem;
  mission.route = route;
  return mission;
}

describe('progresso da rota', () => {
  it('mantém todas as corridas do veículo licenciado no modo oficial', () => {
    expect(isOfficialTaxiRide(true, 3)).toBe(true);
    expect(isOfficialTaxiRide(true, 1)).toBe(true);
    expect(isOfficialTaxiRide(false, 3)).toBe(false);
  });

  it('mantém o trecho inicial ao cruzar uma parte futura da rota', () => {
    const mission = missionWithRoute([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: -100 },
      { x: 50, y: -100 },
      { x: 50, y: 100 }
    ]);
    mission.advanceRoute({ x: 50, y: 1 });
    expect(mission.route[1]).toEqual({ x: 100, y: 0 });
    expect(mission.route).toHaveLength(5);
  });

  it('não troca a rota enquanto o carro apenas passa por uma avenida conectada', () => {
    const mission = missionWithRoute([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(mission.advanceRoute({ x: 30, y: 30 })).toBeCloseTo(30);
    expect(mission.route).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });

  it('remove pontos duplicados e avança depois de concluir uma curva', () => {
    const mission = missionWithRoute([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ]);
    expect(mission.advanceRoute({ x: 10, y: 3 })).toBeCloseTo(0);
    expect(mission.route[0]).toEqual({ x: 10, y: 3 });
    expect(mission.route[1]).toEqual({ x: 10, y: 10 });
  });

  it('aceita a tolerância maior apenas para a chegada do piloto automático', () => {
    const mission = missionWithRoute([]);
    mission.mission = {
      id: 'arrival-test',
      passengerName: 'Teste',
      phase: 'passenger-on-board',
      pickup: { x: -100, y: 0 },
      destination: { x: 10, y: 0 },
      pickupLabel: 'Origem',
      destinationLabel: 'Destino',
      distanceTravelled: 100,
      elapsedSeconds: 10
    };
    mission.receipt = null;

    expect(mission.update({ x: 0, y: 0 }, 6, 0.1, 0, 5)).toBeNull();
    expect(mission.update({ x: 0, y: 0 }, 6, 0.1, 0, 5, 12, 8)).toBe('completed');
  });

  it('mostra a distância roteada até a busca enquanto a corrida ainda é uma oferta', () => {
    const mission = missionWithRoute([]);
    mission.mission = {
      id: 'offer-distance', passengerName: 'Teste', phase: 'offered',
      pickup: { x: 10, y: 0 }, destination: { x: 20, y: 0 },
      pickupLabel: 'Origem', destinationLabel: 'Destino',
      distanceTravelled: 0, elapsedSeconds: 0, pickupDistanceKm: 0.42
    };

    expect(mission.remainingDistance({ x: 0, y: 0 })).toBe(420);
  });

  it('substitui um alvo provisório inalcançável quando o grafo global assume a rota', () => {
    const mission = missionWithRoute([]);
    mission.mission = {
      id: 'global-recovery', passengerName: 'Teste', phase: 'pickup',
      pickup: { x: 80, y: 0 }, destination: { x: 1_200, y: 0 },
      pickupLabel: 'Origem provisória', destinationLabel: 'Destino',
      distanceTravelled: 0, elapsedSeconds: 0, distanceBand: 'short'
    };
    const router = {
      reachableCandidates: () => [{ id: 'reachable', x: 600, y: 0, edges: [] }],
      drivingRoute: (from: { x: number; y: number }, to: { x: number; y: number }) => [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
      distance: (route: Array<{ x: number; y: number }>) => Math.hypot(route[1].x - route[0].x, route[1].y - route[0].y)
    };
    Object.assign(mission as unknown as object, { router, vehicleContext: {} });

    expect(mission.recoverTargetRoute({ x: 0, y: 0 }, 0)).toEqual([{ x: 0, y: 0 }, { x: 600, y: 0 }]);
    expect(mission.mission.pickup).toEqual({ x: 600, y: 0 });
    expect(mission.mission.pickupDistanceKm).toBe(0.6);
  });
});
