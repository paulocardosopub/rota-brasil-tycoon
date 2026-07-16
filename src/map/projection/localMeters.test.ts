import { describe, expect, it } from 'vitest';
import { latLonToLocalMeters, localMetersToLatLon } from './localMeters';

describe('projeção geográfica local', () => {
  it('faz ida e volta com precisão para o recorte de Brasília', () => {
    const origin = { lat: -15.7942, lon: -47.8822 };
    const source = { lat: -15.7923, lon: -47.8791 };
    const meters = latLonToLocalMeters(source.lat, source.lon, origin);
    const result = localMetersToLatLon(meters.x, meters.y, origin);
    expect(result.lat).toBeCloseTo(source.lat, 8);
    expect(result.lon).toBeCloseTo(source.lon, 8);
  });
});
