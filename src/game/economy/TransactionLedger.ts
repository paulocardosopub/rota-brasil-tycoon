import { GAME_CONFIG } from '../../config/gameConfig';
import type { LedgerTransaction, PlayerSave, TransactionCategory, TransactionKind } from '../../types/game';

export interface TransactionRequest {
  kind: TransactionKind;
  category: TransactionCategory;
  value: number;
  origin: string;
  idempotencyKey: string;
  rideId?: string;
  metadata?: Record<string, string | number | boolean>;
  allowDebt?: boolean;
}

export interface TransactionResult {
  applied: boolean;
  transaction?: LedgerTransaction;
  reason?: 'duplicate' | 'invalid' | 'insufficient-funds';
}

export function applyTransaction(save: PlayerSave, request: TransactionRequest): TransactionResult {
  if (!request.idempotencyKey || !Number.isFinite(request.value) || request.value <= 0) return { applied: false, reason: 'invalid' };
  if (save.ledger.some((entry) => entry.idempotencyKey === request.idempotencyKey)) return { applied: false, reason: 'duplicate' };

  const value = roundMoney(request.value);
  const isIncome = request.kind === 'income' || (request.kind === 'adjustment' && request.category === 'dev');
  const signedAmount = isIncome ? value : -value;
  const before = finiteMoney(save.money);
  const wouldBe = roundMoney(before + signedAmount);
  if (!isIncome && wouldBe < 0 && !request.allowDebt) return { applied: false, reason: 'insufficient-funds' };

  const after = Math.max(0, wouldBe);
  const debtCreated = !isIncome ? Math.max(0, -wouldBe) : 0;
  if (debtCreated) save.debts = roundMoney(finiteMoney(save.debts) + debtCreated);
  save.money = after;
  if (isIncome) save.totalEarned = roundMoney(finiteMoney(save.totalEarned) + value);
  else save.totalSpent = roundMoney(finiteMoney(save.totalSpent) + Math.min(value, before));

  const transaction: LedgerTransaction = {
    id: `tx-${Date.now()}-${save.ledger.length + 1}`,
    kind: debtCreated ? 'debt' : request.kind,
    category: request.category,
    amount: signedAmount,
    balanceBefore: before,
    balanceAfter: after,
    createdAt: new Date().toISOString(),
    rideId: request.rideId,
    origin: request.origin,
    metadata: { ...(request.metadata ?? {}), ...(debtCreated ? { debtCreated } : {}) },
    idempotencyKey: request.idempotencyKey,
    vehicleId: metadataString(request.metadata?.vehicleId),
    driverId: metadataString(request.metadata?.driverId),
    fleetId: metadataString(request.metadata?.fleetId),
    tripId: metadataString(request.metadata?.tripId),
    ownerId: metadataString(request.metadata?.ownerId)
  };
  save.ledger = [transaction, ...save.ledger].slice(0, GAME_CONFIG.storage.ledgerLimit);
  return { applied: true, transaction };
}

export function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function finiteMoney(value: number) {
  return Number.isFinite(value) ? roundMoney(Math.max(0, value)) : 0;
}

function metadataString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
