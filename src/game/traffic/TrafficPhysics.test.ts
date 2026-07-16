import { describe, expect, it } from 'vitest';
import { pathsConflict, pointOverlapsVehicle, yieldingPathsConflict } from './TrafficPhysics';

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
});
