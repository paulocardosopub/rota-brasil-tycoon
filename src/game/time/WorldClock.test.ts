import { describe, expect, it } from 'vitest';
import { averageWorldConditions, formatWorldTime, periodAt, trafficMultiplierAt, WorldClock, worldClockSnapshotAt } from './WorldClock';

describe('WorldClock', () => {
  it('classifica todos os limites do dia sem lacunas', () => {
    expect(periodAt(0)).toBe('madrugada');
    expect(periodAt(419.99)).toBe('amanhecer');
    expect(periodAt(420)).toBe('pico-manha');
    expect(periodAt(539.99)).toBe('pico-manha');
    expect(periodAt(540)).toBe('dia');
    expect(periodAt(1_019.99)).toBe('transicao-tarde');
    expect(periodAt(1_020)).toBe('pico-tarde');
    expect(periodAt(1_139.99)).toBe('pico-tarde');
    expect(periodAt(1_140)).toBe('noite');
    expect(periodAt(1_320)).toBe('noite-avancada');
  });

  it('usa 96 minutos reais por dia e persiste o avanço', () => {
    const clock = new WorldClock({ gameMinute: 360, targetGameMinute: 360, lastPeriod: 'amanhecer', lastServerTimeMs: null });
    for (let second = 0; second < 240; second += 1) clock.update(1_000);
    expect(clock.snapshot().gameMinute).toBeCloseTo(420, 4);
    expect(formatWorldTime(clock.snapshot().gameMinute)).toBe('07:00');
    const restored = new WorldClock(clock.saveState());
    expect(restored.snapshot().formattedTime).toBe('07:00');
  });

  it('continua avançando enquanto o jogo está fechado', () => {
    const clock = new WorldClock({
      gameMinute: 360,
      targetGameMinute: 360,
      savedAtRealTimeMs: Date.now() - 4_000,
      lastPeriod: 'amanhecer',
      lastServerTimeMs: null
    });
    expect(clock.snapshot().gameMinute).toBeCloseTo(361, 1);
  });

  it('aplica densidade e bônus somente nos períodos configurados', () => {
    expect(trafficMultiplierAt(120)).toBe(0.4);
    expect(trafficMultiplierAt(360)).toBeCloseTo(0.575, 3);
    expect(worldClockSnapshotAt(450).trafficMultiplier).toBe(1);
    expect(worldClockSnapshotAt(450).passengerDemandBonus).toBe(0.1);
    expect(worldClockSnapshotAt(600).passengerDemandBonus).toBe(0);
    expect(worldClockSnapshotAt(1_050).directionalFlow).toBe('toward-residential');
  });

  it('pondera operações que atravessam períodos diferentes', () => {
    const conditions = averageWorldConditions(410, 40 * 60, 48);
    expect(conditions.trafficMultiplier).toBeGreaterThan(0.75);
    expect(conditions.trafficMultiplier).toBeLessThan(1);
    expect(conditions.passengerDemandBonus).toBeGreaterThan(0);
    expect(conditions.endGameMinute).toBeCloseTo(1_010, 3);
  });
});
