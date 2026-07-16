import { describe, expect, it } from 'vitest';
import { calculateFare } from './fare';

describe('calculateFare compatível', () => {
  it('usa a fonte central de tarifa, qualidade e gorjeta', () => {
    const receipt = calculateFare(2_000, 600, 5);
    expect(receipt.baseFare).toBe(7.5);
    expect(receipt.distanceFare).toBeCloseTo(8.4);
    expect(receipt.timeFare).toBeCloseTo(5);
    expect(receipt.total).toBeGreaterThan(receipt.guaranteedTotal!);
    expect(receipt.xp).toBeGreaterThan(40);
  });

  it('nunca cria valores negativos', () => {
    expect(calculateFare(-10, -20, 3).total).toBeGreaterThanOrEqual(9);
  });
});
