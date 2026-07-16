import { GAME_CONFIG } from '../../config/gameConfig';
import type { Receipt } from '../../types/game';

export function calculateFare(distanceMeters: number, elapsedSeconds: number, rating: number): Receipt {
  const distanceKm = Math.max(0, distanceMeters) / 1000;
  const timeMinutes = Math.max(0, elapsedSeconds) / 60;
  const baseFare = GAME_CONFIG.fare.base;
  const distanceFare = distanceKm * GAME_CONFIG.fare.perKilometer;
  const timeFare = timeMinutes * GAME_CONFIG.fare.perMinute;
  const subtotal = (baseFare + distanceFare + timeFare) * GAME_CONFIG.fare.testMultiplier;
  const ratingRatio = Math.max(0, Math.min(1, (rating - 4) / 1));
  const ratingBonus = subtotal * GAME_CONFIG.fare.maxRatingBonusPercent * ratingRatio;
  const total = subtotal + ratingBonus;

  return {
    distanceKm,
    timeMinutes,
    baseFare,
    distanceFare,
    timeFare,
    ratingBonus,
    total,
    xp: Math.round(20 + distanceKm * 12),
    rating: Math.max(4.5, Math.min(5, rating + 0.01))
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
