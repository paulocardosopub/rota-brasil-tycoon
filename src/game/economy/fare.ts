import type { Receipt } from '../../types/game';
import { createFareQuote, settleFare } from './FareCalculator';

/** Compatibilidade com chamadas históricas; toda a regra vive em FareCalculator. */
export function calculateFare(distanceMeters: number, elapsedSeconds: number, rating: number): Receipt {
  const quote = createFareQuote({
    distanceMeters, estimatedSeconds: elapsedSeconds, category: 'popular', demand: 1, difficulty: 1,
    condition: 70, comfortLevel: 0, rating
  });
  return settleFare(quote, {
    collisions: 0, redLights: 0, deviationSeconds: 0, aggressiveSeconds: 0, startedAt: new Date(0).toISOString()
  }, distanceMeters, elapsedSeconds, 70);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
