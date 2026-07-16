import type { PlayerSave, TransactionCategory } from '../../types/game';
import { applyTransaction, type TransactionResult } from './TransactionLedger';

export class EconomyService {
  constructor(private readonly save: PlayerSave) {}

  income(value: number, category: TransactionCategory, origin: string, idempotencyKey: string, rideId?: string, metadata = {}) {
    return applyTransaction(this.save, { kind: 'income', category, value, origin, idempotencyKey, rideId, metadata });
  }

  expense(value: number, category: TransactionCategory, origin: string, idempotencyKey: string, allowDebt = false, metadata = {}) {
    return applyTransaction(this.save, { kind: 'expense', category, value, origin, idempotencyKey, allowDebt, metadata });
  }

  canAfford(value: number) {
    return Number.isFinite(value) && value > 0 && this.save.money >= value;
  }

  settleDebt(value: number, idempotencyKey: string): TransactionResult {
    const payment = Math.min(Math.max(0, value), this.save.debts);
    if (!payment) return { applied: false, reason: 'invalid' };
    const result = this.expense(payment, 'emergency', 'Pagamento de dívida', idempotencyKey);
    if (result.applied) this.save.debts = Math.max(0, Math.round((this.save.debts - payment) * 100) / 100);
    return result;
  }
}
