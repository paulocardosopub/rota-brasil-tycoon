import { describe, expect, it } from 'vitest';
import type { MapRegion } from '../../types/game';
import { selectTrafficDestinationRegion, targetNpcPopulation } from './TrafficWorldFlow';

const region = (id: string, predominantType: MapRegion['predominantType'], playable = true) => ({ id, predominantType, playable } as MapRegion);
const regions = [
  region('asa-sul', 'residential'),
  region('centro', 'central'),
  region('setor-comercial', 'commercial'),
  region('unb', 'university'),
  region('lago-sul', 'mixed'),
  region('aeroporto', 'airport')
];

describe('fluxo de trânsito por período', () => {
  it('direciona manhã ao centro/comércio/UnB e tarde às áreas residenciais', () => {
    const morning = Array.from({ length: 12 }, (_, index) => selectTrafficDestinationRegion(regions, index, 'toward-central')!);
    expect(morning.every((item) => ['central', 'commercial', 'university'].includes(item.predominantType))).toBe(true);
    const evening = Array.from({ length: 12 }, (_, index) => selectTrafficDestinationRegion(regions, index, 'toward-residential')!);
    expect(evening.every((item) => item.predominantType === 'residential' || item.id === 'lago-sul')).toBe(true);
  });

  it('reserva vagas de jogadores e frota dentro do teto variável', () => {
    expect(targetNpcPopulation(72, 1, 0.4, 0)).toBe(29);
    expect(targetNpcPopulation(72, 1, 1, 5)).toBe(67);
    expect(targetNpcPopulation(72, 0.56, 0.7, 2)).toBe(26);
  });
});
