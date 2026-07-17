import { describe, expect, it } from 'vitest';
import { simulateRegionalEconomy } from './RegionalEconomySimulator';

describe('economia regional 0.8.2', () => {
  it('mantém todos os cenários lucrativos e corrige deslocamento vazio', () => {
    const results = simulateRegionalEconomy();
    expect(results).toHaveLength(12);
    expect(results.every((result) => result.afterNet > 0 && result.softlockRisk === 'baixo')).toBe(true);
    expect(results.find((result) => result.scenario === 'base-regional')!.afterNet)
      .toBeGreaterThan(results.find((result) => result.scenario === 'base-regional')!.beforeNet);
    const averageImprovement = results.reduce((sum, result) => sum + result.differencePercent, 0) / results.length;
    expect(averageImprovement).toBeGreaterThanOrEqual(10);
    expect(averageImprovement).toBeLessThanOrEqual(20);
  });
});
