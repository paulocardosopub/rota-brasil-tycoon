import { describe, expect, it } from 'vitest';
import { calculateMeterFare, createTaxiMeter, finishTaxiMeter, markTaxiBoarding, prepareTaxiMeter, startTaxiMeter, updateTaxiMeter } from './TaxiMeter';

describe('taxímetro', () => {
  it('só inicia depois do embarque e não acumula a caminho', () => {
    const meter = createTaxiMeter();
    prepareTaxiMeter(meter, 'trip-1', 'Destino', 'popular');
    updateTaxiMeter(meter, 500, 10, 35);
    expect(meter.distanceMeters).toBe(0);
    markTaxiBoarding(meter);
    expect(startTaxiMeter(meter, '2026-07-16T10:00:00.000Z')).toBe(true);
    expect(meter.state).toBe('occupied');
  });

  it('calcula distância, espera e finaliza uma única vez', () => {
    const meter = createTaxiMeter();
    prepareTaxiMeter(meter, 'trip-2', 'Hotel', 'comfort', 1.1);
    markTaxiBoarding(meter); startTaxiMeter(meter);
    updateTaxiMeter(meter, 1_000, 0.25, 32);
    for (let index = 0; index < 240; index += 1) updateTaxiMeter(meter, 0, 0.25, 0);
    const expected = calculateMeterFare(meter);
    expect(meter.distanceMeters).toBe(1_000);
    expect(meter.waitingSeconds).toBe(60);
    expect(finishTaxiMeter(meter)).toBe(expected);
    const frozen = meter.currentFare;
    updateTaxiMeter(meter, 5_000, 60, 40);
    expect(meter.currentFare).toBe(frozen);
  });

  it('limita delta anormal e tarifa máxima', () => {
    const meter = createTaxiMeter();
    prepareTaxiMeter(meter, 'trip-3', 'Destino', 'urgent', 9);
    markTaxiBoarding(meter); startTaxiMeter(meter);
    updateTaxiMeter(meter, 100_000, 9_999, 80);
    expect(meter.elapsedSeconds).toBe(0.25);
    expect(meter.currentFare).toBeLessThanOrEqual(85);
  });
});
