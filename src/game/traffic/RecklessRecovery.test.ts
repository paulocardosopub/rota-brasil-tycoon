import { describe, expect, it } from 'vitest';
import { RecklessRecovery } from './RecklessRecovery';

const options = { thresholdSeconds: 10, maximumSeconds: 5, escapeDistanceMeters: 18 };

describe('destravamento imprudente do trânsito', () => {
  it('só entra no modo de fuga depois de dez segundos sem progresso', () => {
    const recovery = new RecklessRecovery(options);
    for (let tick = 0; tick < 99; tick += 1) {
      expect(recovery.update({ deltaSeconds: 0.1, blocked: true, travelledMeters: 0 }).started).toBe(false);
    }
    expect(recovery.active).toBe(false);
    const threshold = recovery.update({ deltaSeconds: 0.1, blocked: true, travelledMeters: 0 });
    expect(threshold.started).toBe(true);
    expect(threshold.active).toBe(true);
  });

  it('não trata uma espera normal de semáforo como congestionamento', () => {
    const recovery = new RecklessRecovery(options);
    for (let tick = 0; tick < 150; tick += 1) {
      recovery.update({ deltaSeconds: 0.1, blocked: false, travelledMeters: 0 });
    }
    expect(recovery.active).toBe(false);
    expect(recovery.stoppedSeconds).toBe(0);
  });

  it('encerra a imprudência assim que o veículo escapa da fila', () => {
    const recovery = new RecklessRecovery(options);
    recovery.start();
    expect(recovery.update({ deltaSeconds: 0.1, blocked: false, travelledMeters: 9 }).active).toBe(true);
    const escaped = recovery.update({ deltaSeconds: 0.1, blocked: false, travelledMeters: 9 });
    expect(escaped.finished).toBe(true);
    expect(recovery.active).toBe(false);
  });

  it('permite que todos os veículos de uma fila se destravem independentemente', () => {
    const queue = Array.from({ length: 4 }, () => new RecklessRecovery(options));
    for (let tick = 0; tick < 100; tick += 1) {
      for (const recovery of queue) recovery.update({ deltaSeconds: 0.1, blocked: true, travelledMeters: 0 });
    }
    expect(queue.every((recovery) => recovery.active)).toBe(true);
  });
});
