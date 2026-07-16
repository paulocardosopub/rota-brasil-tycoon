import { describe, expect, it } from 'vitest';
import { calculateFare } from './fare';

describe('calculateFare', () => {
  it('aplica base, distância, tempo, multiplicador e bônus', () => {
    const receipt = calculateFare(2_000, 600, 5);
    expect(receipt.baseFare).toBe(5);
    expect(receipt.distanceFare).toBeCloseTo(3.6);
    expect(receipt.timeFare).toBeCloseTo(3.5);
    expect(receipt.total).toBeCloseTo((5 + 3.6 + 3.5) * 2.5 * 1.12);
    expect(receipt.xp).toBe(44);
  });

  it('nunca cria valores negativos', () => {
    expect(calculateFare(-10, -20, 3).total).toBe(12.5);
  });
});
