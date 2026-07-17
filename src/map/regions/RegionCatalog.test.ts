import { describe, expect, it } from 'vitest';
import { latLonToLocalMeters } from '../projection/localMeters';
import { buildRegionCatalog, familiarityLevel, pointInPolygon, regionAt } from './RegionCatalog';

const origin = { lat: -15.7942, lon: -47.8822 };

describe('catálogo regional 0.8.2', () => {
  const regions = buildRegionCatalog(origin);

  it('mantém ids estáveis, fontes abertas e geofences fechadas', () => {
    expect(regions.map((region) => region.id)).toEqual(expect.arrayContaining([
      'centro', 'asa-sul', 'asa-norte', 'sudoeste', 'cruzeiro', 'noroeste',
      'vila-planalto', 'lago-sul', 'lago-norte', 'jardim-botanico', 'aeroporto'
    ]));
    for (const region of regions) {
      expect(region.source.url).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
      expect(region.polygon[0]).toEqual(region.polygon.at(-1));
      expect(pointInPolygon(region.center, region.polygon)).toBe(true);
    }
  });

  it.each([
    ['lago-sul', -15.842, -47.867],
    ['jardim-botanico', -15.869, -47.773],
    ['lago-norte', -15.728, -47.871],
    ['aeroporto', -15.872, -47.912]
  ])('classifica %s pelo polígono e respeita o enclave do aeroporto', (id, lat, lon) => {
    expect(regionAt(latLonToLocalMeters(lat, lon, origin), regions).id).toBe(id);
  });

  it('mantém familiaridade em apenas três níveis moderados', () => {
    expect(familiarityLevel(0, 0)).toBe('new');
    expect(familiarityLevel(4, 12)).toBe('known');
    expect(familiarityLevel(12, 45)).toBe('favorite');
  });
});
