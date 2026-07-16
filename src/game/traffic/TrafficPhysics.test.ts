import { describe, expect, it } from 'vitest';
import { distanceAlongRoute, impactMetrics, pathsConflict, pointOverlapsVehicle, severityForImpact, sweptPointOverlapsVehicle, yieldingPathsConflict } from './TrafficPhysics';

describe('física preventiva do trânsito', () => {
  it('detecta trajetórias que se cruzam em poucos segundos', () => {
    expect(pathsConflict(
      { position: { x: -10, y: 0 }, heading: 0, speed: 5 },
      { position: { x: 0, y: -10 }, heading: Math.PI / 2, speed: 5 },
      3,
      3
    )).toBe(true);
  });

  it('não freia veículos paralelos em faixas separadas', () => {
    expect(pathsConflict(
      { position: { x: 0, y: 0 }, heading: 0, speed: 8 },
      { position: { x: 4, y: 5 }, heading: 0, speed: 8 },
      3,
      3
    )).toBe(false);
  });

  it('não manda o veículo da frente frear por causa de alguém vindo atrás', () => {
    const front = { position: { x: 0, y: 0 }, heading: 0, speed: 5 };
    const follower = { position: { x: -10, y: 0 }, heading: 0, speed: 10 };
    expect(pathsConflict(front, follower, 3, 3)).toBe(true);
    expect(yieldingPathsConflict(front, follower, 3, 3)).toBe(false);
  });

  it('reconhece contato real sem ampliar para a faixa vizinha', () => {
    expect(pointOverlapsVehicle({ x: 1, y: 0.5 }, { x: 0, y: 0 }, 0, 4.4, 1.9, 4.1, 1.82)).toBe(true);
    expect(pointOverlapsVehicle({ x: 1, y: 3.5 }, { x: 0, y: 0 }, 0, 4.4, 1.9, 4.1, 1.82)).toBe(false);
  });

  it('enxerga sinais e veículos depois de uma curva da rota', () => {
    const route = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }];
    expect(distanceAlongRoute({ x: 0, y: 0 }, route, { x: 20, y: 12 }, 2, 40)).toBe(32);
    expect(distanceAlongRoute({ x: 0, y: 0 }, route, { x: 27, y: 12 }, 2, 40)).toBeNull();
  });

  it('classifica contato, batida leve, moderada e severa pela velocidade relativa', () => {
    expect(severityForImpact(2)).toBe('contact');
    expect(severityForImpact(12)).toBe('light');
    expect(severityForImpact(32)).toBe('moderate');
    expect(severityForImpact(65)).toBe('severe');
    const headOn = impactMetrics(
      { position: { x: 0, y: 0 }, heading: 0, speed: 12 },
      { position: { x: 1, y: 0 }, heading: Math.PI, speed: 8 }
    );
    expect(headOn.direction).toBe('front');
    expect(headOn.severity).toBe('severe');
  });

  it('detecta colisão varrida mesmo quando o quadro atravessa o alvo', () => {
    const hit = sweptPointOverlapsVehicle(
      { x: -8, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 0 }, 0, 4.4, 1.9, 4.1, 1.82
    );
    expect(hit).not.toBeNull();
    expect(hit!.progress).toBeGreaterThan(0);
    expect(hit!.progress).toBeLessThan(1);
  });
});
