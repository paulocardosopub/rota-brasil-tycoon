import { describe, expect, it } from 'vitest';
import { createFareQuote, settleFare } from './FareCalculator';

describe('tarifa fixa e qualidade', () => {
  const quote = createFareQuote({ distanceMeters: 1_400, estimatedSeconds: 240, category: 'popular', demand: 1, difficulty: 1, condition: 70, comfortLevel: 0, rating: 4.8 });

  it('fixa valor finito entre mínimo e máximo no aceite', () => {
    expect(quote.guaranteedTotal).toBeGreaterThanOrEqual(9);
    expect(quote.guaranteedTotal).toBeLessThanOrEqual(48);
    expect(Number.isFinite(quote.guaranteedTotal)).toBe(true);
  });

  it('não reduz o garantido e premia viagem cuidadosa com gorjeta pequena', () => {
    const receipt = settleFare(quote, { collisions: 0, redLights: 0, deviationSeconds: 2, aggressiveSeconds: 0, startedAt: '' }, 1_400, 240, 70);
    expect(receipt.total).toBeGreaterThanOrEqual(quote.guaranteedTotal);
    expect(receipt.tip).toBeGreaterThan(0);
    expect(receipt.tip!).toBeLessThanOrEqual(quote.guaranteedTotal * 0.08 + 0.01);
    expect(receipt.rating).toBe(5);
  });

  it('avalia acidentes, sinais e agressividade sem quebrar o pagamento', () => {
    const receipt = settleFare(quote, { collisions: 2, redLights: 1, deviationSeconds: 40, aggressiveSeconds: 30, startedAt: '' }, 1_700, 400, 25);
    expect(receipt.rating).toBeLessThan(4);
    expect(receipt.total).toBe(quote.guaranteedTotal);
    expect(receipt.penaltyReasons?.length).toBeGreaterThan(2);
  });
});
