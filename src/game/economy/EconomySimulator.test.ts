import { describe, expect, it } from 'vitest';
import { simulateEconomy } from './EconomySimulator';

describe('simulador econômico headless', () => {
  it('mantém o perfil médio lucrativo nas janelas de progressão', () => {
    const result = simulateEconomy('average', 30);
    expect(result.profit).toBeGreaterThan(0);
    expect(result.firstFuelMinute).toBeGreaterThanOrEqual(15);
    expect(result.firstFuelMinute).toBeLessThanOrEqual(30);
    expect(result.firstPurchaseMinute).toBeGreaterThanOrEqual(15);
    expect(result.firstPurchaseMinute).toBeLessThanOrEqual(30);
    expect(result.regularizationMinute).toBeGreaterThanOrEqual(45);
    expect(result.regularizationMinute).toBeLessThanOrEqual(90);
  });

  it('deixa o perfil ruim recuperável e próximo do piloto/manual', () => {
    const bad = simulateEconomy('bad', 30);
    const manual = simulateEconomy('manual', 30);
    const autopilot = simulateEconomy('autopilot', 30);
    expect(bad.balance + bad.debt).toBeGreaterThan(0);
    expect(Math.abs(manual.profit - autopilot.profit)).toBeLessThan(50);
  });
});
