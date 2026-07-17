import type { RideCategory, RideQuality } from '../../types/game';
import { createFareQuote, settleFare } from './FareCalculator';
import { roundMoney } from './TransactionLedger';

export type RegionalEconomyScenario =
  | 'curta-central' | 'regional' | 'lago-sul' | 'jardim-botanico'
  | 'entre-regioes' | 'retorno' | 'transito-normal' | 'manual' | 'piloto'
  | 'combustivel-baixo' | 'oficina-distante' | 'base-regional';

type Scenario = {
  id: RegionalEconomyScenario;
  rideKm: number;
  pickupKm: number;
  minutes: number;
  demand: number;
  category: RideCategory;
  emptyKmBefore?: number;
  emptyKmAfter?: number;
  serviceCostBefore?: number;
  serviceCostAfter?: number;
};

const SCENARIOS: Scenario[] = [
  { id: 'curta-central', rideKm: 0.9, pickupKm: 0.5, minutes: 4, demand: 1.04, category: 'popular' },
  { id: 'regional', rideKm: 3.8, pickupKm: 0.9, minutes: 10, demand: 1.06, category: 'popular' },
  { id: 'lago-sul', rideKm: 6.2, pickupKm: 1.3, minutes: 15, demand: 1.08, category: 'comfort' },
  { id: 'jardim-botanico', rideKm: 8.4, pickupKm: 1.5, minutes: 19, demand: 1.03, category: 'popular' },
  { id: 'entre-regioes', rideKm: 12.5, pickupKm: 1.8, minutes: 27, demand: 1.08, category: 'popular' },
  { id: 'retorno', rideKm: 5.4, pickupKm: 0.8, minutes: 13, demand: 1.02, category: 'popular', emptyKmBefore: 3.4, emptyKmAfter: 1.2 },
  { id: 'transito-normal', rideKm: 4.6, pickupKm: 1.1, minutes: 16, demand: 1.05, category: 'popular' },
  { id: 'manual', rideKm: 4.8, pickupKm: 0.8, minutes: 12, demand: 1.06, category: 'urgent' },
  { id: 'piloto', rideKm: 4.8, pickupKm: 1.0, minutes: 13, demand: 1.05, category: 'popular' },
  { id: 'combustivel-baixo', rideKm: 4.1, pickupKm: 0.7, minutes: 11, demand: 1.04, category: 'popular' },
  { id: 'oficina-distante', rideKm: 5.2, pickupKm: 1.2, minutes: 14, demand: 1.04, category: 'popular', serviceCostBefore: 48 / 8, serviceCostAfter: 44 / 8 },
  { id: 'base-regional', rideKm: 4.4, pickupKm: 0.7, minutes: 12, demand: 1.05, category: 'popular', emptyKmBefore: 4.2, emptyKmAfter: 1.1 }
];

export function simulateRegionalEconomy() {
  return SCENARIOS.map((scenario) => {
    const before = simulateProfile(scenario, false);
    const after = simulateProfile(scenario, true);
    return {
      scenario: scenario.id,
      distanceKm: scenario.rideKm,
      pickupKm: scenario.pickupKm,
      beforeNet: before,
      afterNet: after,
      differencePercent: roundMoney((after - before) / Math.max(0.01, before) * 100),
      softlockRisk: after > 0 ? 'baixo' : 'alto'
    };
  });
}

function simulateProfile(scenario: Scenario, after: boolean) {
  const emptyKm = after ? scenario.emptyKmAfter ?? scenario.pickupKm : scenario.emptyKmBefore ?? scenario.pickupKm;
  const quality: RideQuality = { collisions: 0, redLights: 0, deviationSeconds: 4, aggressiveSeconds: 1, startedAt: '' };
  let gross: number;
  if (after) {
    const quote = createFareQuote({
      distanceMeters: scenario.rideKm * 1_000,
      estimatedSeconds: scenario.minutes * 60,
      category: scenario.category,
      demand: scenario.demand,
      difficulty: 1.02,
      condition: 82,
      comfortLevel: 1,
      rating: 4.75
    });
    gross = settleFare(quote, quality, scenario.rideKm * 1_000, scenario.minutes * 60, 82).total;
  } else {
    const base = 7.5;
    const variable = scenario.rideKm * 4.2 + scenario.minutes * 0.5;
    const category = scenario.category === 'urgent' ? 1.22 : scenario.category === 'comfort' ? 1.15 : 1;
    const ratingBonus = (base + variable) * 0.06;
    const urgency = scenario.category === 'urgent' ? 2.25 : 0;
    const guaranteed = Math.min(48, Math.max(9, (base + variable) * scenario.demand * category * 1.02 + ratingBonus + urgency));
    gross = guaranteed * 1.04 + guaranteed * 0.035;
  }
  const operationKm = scenario.rideKm + emptyKm;
  const fuel = operationKm / 9 * 5.79;
  const maintenance = operationKm * (after ? 0.17 : 0.18);
  const service = after ? scenario.serviceCostAfter ?? 0 : scenario.serviceCostBefore ?? 0;
  return roundMoney(gross - fuel - maintenance - service);
}
