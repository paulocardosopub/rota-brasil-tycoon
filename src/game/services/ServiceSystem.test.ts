import { describe, expect, it } from 'vitest';
import type { MapServiceLocation } from '../../types/game';
import { serviceAccessDistance } from './ServiceSystem';

const service: MapServiceLocation = {
  id: 'shared-access-fuel',
  category: 'fuel',
  gameName: 'Posto de teste',
  realName: 'Posto de teste',
  lat: 0,
  lon: 0,
  sourceType: 'node',
  sourceId: 'source',
  buildingId: 'building',
  address: 'Endereço de teste',
  entrance: { x: 0, y: 0, lat: 0, lon: 0, graphNodeId: 'entry' },
  stopPoint: { x: 18, y: 0, lat: 0, lon: 0 },
  accessRoad: 'via de teste',
  sideOfRoad: 'lado direito',
  confidence: 'high',
  functionFictional: false
};

describe('acesso aos serviços', () => {
  it('reconhece tanto a entrada quanto o ponto interno do serviço', () => {
    expect(serviceAccessDistance(service, { x: 2, y: 0 })).toBe(2);
    expect(serviceAccessDistance(service, { x: 16, y: 0 })).toBe(2);
  });
});
