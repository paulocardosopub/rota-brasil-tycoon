import { describe, expect, it } from 'vitest';
import { createNewSave } from '../../services/storage/saveService';
import { fuelPurchaseCost, upgradeEffects, upgradePrice, workshopPrice } from './ExpenseCalculator';

describe('despesas e melhorias', () => {
  it('calcula combustível e reparos sem valores negativos', () => {
    expect(fuelPurchaseCost(10)).toBe(57.9);
    expect(fuelPurchaseCost(-2)).toBe(0);
    expect(workshopPrice('partial', 40, 25)).toBeGreaterThan(105);
  });

  it('limita melhorias a três níveis e aplica efeitos reais', () => {
    const upgrades = createNewSave().upgrades;
    expect(upgradePrice('engine', upgrades)).toBe(180);
    upgrades.engine = 3;
    upgrades.economy = 2;
    expect(upgradePrice('engine', upgrades)).toBeNull();
    const effects = upgradeEffects(upgrades);
    expect(effects.maxSpeedMultiplier).toBeGreaterThan(1);
    expect(effects.fuelMultiplier).toBeLessThan(1);
  });
});
