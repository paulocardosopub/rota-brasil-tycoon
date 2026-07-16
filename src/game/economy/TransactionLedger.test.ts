import { describe, expect, it } from 'vitest';
import { createNewSave } from '../../services/storage/saveService';
import { EconomyService } from './EconomyService';

describe('EconomyService e ledger', () => {
  it('aplica uma transação apenas uma vez e mantém saldos rastreáveis', () => {
    const save = createNewSave();
    const economy = new EconomyService(save);
    expect(economy.income(25, 'ride', 'Corrida teste', 'ride-1').applied).toBe(true);
    expect(economy.income(25, 'ride', 'Corrida teste', 'ride-1').reason).toBe('duplicate');
    expect(save.money).toBe(125);
    expect(save.ledger).toHaveLength(1);
    expect(save.ledger[0]).toMatchObject({ balanceBefore: 100, balanceAfter: 125, amount: 25 });
  });

  it('bloqueia NaN, saldo insuficiente e compra duplicada', () => {
    const save = createNewSave();
    const economy = new EconomyService(save);
    expect(economy.expense(Number.NaN, 'upgrade', 'Inválida', 'nan').reason).toBe('invalid');
    expect(economy.expense(500, 'upgrade', 'Motor', 'upgrade-1').reason).toBe('insufficient-funds');
    expect(save.money).toBe(100);
    expect(save.ledger).toEqual([]);
  });

  it('cria dívida recuperável em emergência sem saldo negativo', () => {
    const save = createNewSave();
    const result = new EconomyService(save).expense(140, 'emergency', 'Socorro', 'emergency-1', true);
    expect(result.applied).toBe(true);
    expect(save.money).toBe(0);
    expect(save.debts).toBe(40);
    expect(save.ledger[0].kind).toBe('debt');
  });
});
