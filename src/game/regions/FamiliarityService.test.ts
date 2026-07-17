import { describe, expect, it } from 'vitest';
import { createNewSave } from '../../services/storage/saveService';
import type { MissionSnapshot, Receipt } from '../../types/game';
import { recordRegionalRide } from './FamiliarityService';

describe('familiaridade regional', () => {
  it('registra corridas, quilômetros, pontos e corredor sem duplicar regiões', () => {
    const save = createNewSave();
    const mission = {
      id: 'ride-regional-1', phase: 'completed', passengerName: 'Ana',
      pickup: { x: 0, y: 0 }, destination: { x: 1, y: 1 },
      pickupLabel: 'Embarque Lago Sul', destinationLabel: 'Destino Jardim Botânico',
      pickupRegionId: 'lago-sul', destinationRegionId: 'jardim-botanico',
      distanceTravelled: 8_000, elapsedSeconds: 900
    } as MissionSnapshot;
    const receipt = { distanceKm: 8, rating: 4.8 } as Receipt;
    recordRegionalRide(save, mission, receipt);
    expect(save.regionalFamiliarity['lago-sul']).toMatchObject({ completedRides: 1, kilometers: 4, workSeconds: 900 });
    expect(save.regionalFamiliarity['jardim-botanico'].destinationIds).toContain('Destino Jardim Botânico');
    expect(save.regionalFamiliarity['lago-sul'].corridorIds['lago-sul>jardim-botanico']).toBe(1);
  });
});
