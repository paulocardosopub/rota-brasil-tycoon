import type { FareQuote, Receipt, RideCategory, RideQuality } from '../../types/game';
import { ECONOMY_CONFIG } from './EconomyConfig';
import { roundMoney } from './TransactionLedger';

export interface QuoteInput {
  distanceMeters: number;
  estimatedSeconds: number;
  category: RideCategory;
  demand: number;
  difficulty: number;
  condition: number;
  comfortLevel: number;
  rating: number;
}

export function createFareQuote(input: QuoteInput): FareQuote {
  const distanceKm = Math.max(0, input.distanceMeters) / 1000;
  const estimatedMinutes = Math.max(1, input.estimatedSeconds / 60);
  const baseFare = ECONOMY_CONFIG.fare.base;
  const distanceFare = distanceKm * ECONOMY_CONFIG.fare.perKilometer;
  const timeFare = estimatedMinutes * ECONOMY_CONFIG.fare.perMinute;
  const demandMultiplier = clamp(input.demand, 0.95, 1.15);
  const categoryMultiplier = ECONOMY_CONFIG.fare.categoryMultiplier[input.category];
  const difficultyMultiplier = clamp(input.difficulty, 1, 1.1);
  const conditionMultiplier = input.condition < 25 ? 0.94 : input.condition < 45 ? 0.98 : 1;
  const comfortBonus = input.category === 'comfort' ? input.comfortLevel * ECONOMY_CONFIG.fare.comfortPerLevel : 0;
  const ratingBonus = (baseFare + distanceFare + timeFare) * clamp((input.rating - 4) * ECONOMY_CONFIG.fare.maximumRatingBonus, 0, ECONOMY_CONFIG.fare.maximumRatingBonus);
  const urgencyBonus = input.category === 'urgent' ? ECONOMY_CONFIG.fare.urgencyBonus : 0;
  const raw = (baseFare + distanceFare + timeFare) * demandMultiplier * categoryMultiplier * difficultyMultiplier * conditionMultiplier
    + comfortBonus + ratingBonus + urgencyBonus;
  return {
    baseFare: roundMoney(baseFare), distanceFare: roundMoney(distanceFare), timeFare: roundMoney(timeFare),
    demandMultiplier, categoryMultiplier, difficultyMultiplier, conditionMultiplier,
    comfortBonus: roundMoney(comfortBonus), ratingBonus: roundMoney(ratingBonus), urgencyBonus: roundMoney(urgencyBonus),
    guaranteedTotal: roundMoney(clamp(raw, ECONOMY_CONFIG.fare.minimum, ECONOMY_CONFIG.fare.maximum)),
    estimatedDistanceKm: Math.round(distanceKm * 100) / 100,
    estimatedMinutes: Math.round(estimatedMinutes * 10) / 10
  };
}

export function settleFare(quote: FareQuote, quality: RideQuality, distanceMeters: number, elapsedSeconds: number, condition: number): Receipt {
  const penaltyReasons: string[] = [];
  const positives: string[] = [];
  let score = 5;
  if (quality.collisions) { score -= Math.min(1.8, quality.collisions * 0.48); penaltyReasons.push(`${quality.collisions} colisão(ões)`); }
  if (quality.redLights) { score -= Math.min(1.2, quality.redLights * 0.38); penaltyReasons.push(`${quality.redLights} sinal(is) vermelho(s)`); }
  if (quality.deviationSeconds > 12) { score -= Math.min(0.55, quality.deviationSeconds / 100); penaltyReasons.push('desvio prolongado'); }
  if (quality.aggressiveSeconds > 8) { score -= Math.min(0.45, quality.aggressiveSeconds / 80); penaltyReasons.push('condução agressiva'); }
  if (condition < 30) { score -= 0.25; penaltyReasons.push('veículo em condição baixa'); }
  if (!quality.collisions) positives.push('viagem sem colisões');
  if (!quality.redLights) positives.push('sinais respeitados');
  if (quality.deviationSeconds <= 12) positives.push('rota bem seguida');
  const rating = Math.round(clamp(score, 1, 5) * 10) / 10;
  const qualityBonus = rating >= 4.7 ? roundMoney(quote.guaranteedTotal * 0.05) : 0;
  const tipPercent = rating >= 4.8 ? 0.07 : rating >= 4.5 ? 0.04 : rating >= 4.2 ? 0.02 : 0;
  const tip = roundMoney(Math.min(quote.guaranteedTotal * ECONOMY_CONFIG.fare.maximumTipPercent, quote.guaranteedTotal * tipPercent));
  return {
    distanceKm: Math.max(0, distanceMeters) / 1000,
    timeMinutes: Math.max(0, elapsedSeconds) / 60,
    baseFare: quote.baseFare,
    distanceFare: quote.distanceFare,
    timeFare: quote.timeFare,
    ratingBonus: quote.ratingBonus,
    guaranteedTotal: quote.guaranteedTotal,
    qualityBonus,
    penalties: 0,
    tip,
    total: roundMoney(quote.guaranteedTotal + qualityBonus + tip),
    xp: Math.round(22 + Math.max(0, distanceMeters) / 1000 * 14 + rating * 3),
    rating,
    positives,
    penaltyReasons
  };
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
