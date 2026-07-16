import { GAME_CONFIG } from '../../config/gameConfig';
import { createNewSave } from '../../services/storage/saveService';
import type { RideCategory, RideQuality } from '../../types/game';
import { refreshProgression } from '../progression/DriverProgression';
import { EconomyService } from './EconomyService';
import { ECONOMY_CONFIG } from './EconomyConfig';
import { createFareQuote, settleFare } from './FareCalculator';
import { fuelPurchaseCost } from './ExpenseCalculator';

export type SimulationScenario = 'careful' | 'average' | 'bad' | 'manual' | 'autopilot' | 'short' | 'mixed' | 'upgrades' | 'repair' | 'regularization';

export interface SimulationResult {
  scenario: SimulationScenario;
  minutes: number;
  rides: number;
  balance: number;
  debt: number;
  firstFuelMinute: number | null;
  firstPurchaseMinute: number | null;
  firstRepairMinute: number | null;
  regularizationMinute: number | null;
  profit: number;
  rating: number;
  totalKm: number;
}

const PARAMETERS: Record<SimulationScenario, { rideKm: number; minutes: number; collisionEvery: number; redEvery: number; rating: number; incomeMultiplier: number }> = {
  careful: { rideKm: 1.45, minutes: 4, collisionEvery: 0, redEvery: 0, rating: 4.95, incomeMultiplier: 1.03 },
  average: { rideKm: 1.35, minutes: 4, collisionEvery: 12, redEvery: 15, rating: 4.55, incomeMultiplier: 1 },
  bad: { rideKm: 1.6, minutes: 5, collisionEvery: 3, redEvery: 4, rating: 3.4, incomeMultiplier: 0.96 },
  manual: { rideKm: 1.4, minutes: 3.8, collisionEvery: 10, redEvery: 16, rating: 4.65, incomeMultiplier: 1.03 },
  autopilot: { rideKm: 1.4, minutes: 4.1, collisionEvery: 18, redEvery: 0, rating: 4.7, incomeMultiplier: 1 },
  short: { rideKm: 0.65, minutes: 3, collisionEvery: 14, redEvery: 18, rating: 4.5, incomeMultiplier: 1 },
  mixed: { rideKm: 1.8, minutes: 5.2, collisionEvery: 8, redEvery: 12, rating: 4.35, incomeMultiplier: 1 },
  upgrades: { rideKm: 1.45, minutes: 4, collisionEvery: 12, redEvery: 15, rating: 4.6, incomeMultiplier: 1 },
  repair: { rideKm: 1.5, minutes: 4.5, collisionEvery: 4, redEvery: 10, rating: 4, incomeMultiplier: 1 },
  regularization: { rideKm: 1.45, minutes: 4, collisionEvery: 15, redEvery: 0, rating: 4.65, incomeMultiplier: 1 }
};

export function simulateEconomy(scenario: SimulationScenario, rideCount = 30): SimulationResult {
  const p = PARAMETERS[scenario];
  const save = createNewSave();
  const startingMoney = save.money;
  let minutes = 0;
  let firstFuelMinute: number | null = null;
  let firstPurchaseMinute: number | null = null;
  let firstRepairMinute: number | null = null;
  let regularizationMinute: number | null = null;

  for (let ride = 1; ride <= rideCount; ride += 1) {
    minutes += p.minutes;
    const category: RideCategory = ride % 5 === 0 ? 'urgent' : ride % 4 === 0 ? 'comfort' : 'popular';
    const collisions = p.collisionEvery && ride % p.collisionEvery === 0 ? 1 : 0;
    const redLights = p.redEvery && ride % p.redEvery === 0 ? 1 : 0;
    const quality: RideQuality = { collisions, redLights, deviationSeconds: scenario === 'bad' ? 24 : 4, aggressiveSeconds: scenario === 'bad' ? 18 : 2, startedAt: new Date(0).toISOString() };
    const quote = createFareQuote({ distanceMeters: p.rideKm * 1000, estimatedSeconds: p.minutes * 60, category, demand: 1, difficulty: 1.02, condition: save.condition, comfortLevel: save.upgrades.comfort, rating: save.rating });
    quote.guaranteedTotal *= p.incomeMultiplier;
    const receipt = settleFare(quote, quality, p.rideKm * 1000, p.minutes * 60, save.condition);
    new EconomyService(save).income(receipt.total, 'ride', `Simulação ${scenario}`, `${scenario}-ride-${ride}`, `sim-${ride}`);
    save.xp += receipt.xp;
    save.completedRides += 1;
    save.rating = Math.round((save.rating * 0.82 + p.rating * 0.18) * 100) / 100;
    save.totalKm += p.rideKm;
    save.fuel = Math.max(0, save.fuel - p.rideKm / 9 - p.minutes * 0.002);
    save.maintenanceWear += p.rideKm * ECONOMY_CONFIG.wear.perKilometer;
    if (collisions) save.collisionDamage += scenario === 'bad' || scenario === 'repair' ? 3.2 : 1.1;
    save.condition = Math.max(0, 100 - save.collisionDamage - save.maintenanceWear * 0.45);

    if (save.fuel < 0.35) {
      const liters = 8;
      const result = new EconomyService(save).expense(fuelPurchaseCost(liters), 'fuel', 'Posto simulado', `${scenario}-fuel-${ride}`, true, { liters });
      if (result.applied) { save.fuel += liters; firstFuelMinute ??= Math.round(minutes); }
    }
    if (firstPurchaseMinute === null && minutes >= 15 && save.money >= 180 && scenario !== 'repair') {
      const result = new EconomyService(save).expense(180, 'upgrade', 'Motor nível 1', `${scenario}-upgrade-1`);
      if (result.applied) { save.upgrades.engine = 1; firstPurchaseMinute = Math.round(minutes); }
    }
    if (save.condition < 62 && firstRepairMinute === null) {
      const result = new EconomyService(save).expense(105, 'repair', 'Reparo parcial', `${scenario}-repair-1`, true);
      if (result.applied) { save.collisionDamage = Math.max(0, save.collisionDamage - 22); save.condition = Math.max(0, 100 - save.collisionDamage); firstRepairMinute = Math.round(minutes); }
    }
    refreshProgression(save);
    if (save.regularizationReady && regularizationMinute === null) regularizationMinute = Math.round(minutes);
  }
  return { scenario, minutes: Math.round(minutes), rides: rideCount, balance: Math.round(save.money * 100) / 100, debt: save.debts,
    firstFuelMinute, firstPurchaseMinute, firstRepairMinute, regularizationMinute,
    profit: Math.round((save.money - startingMoney) * 100) / 100, rating: save.rating, totalKm: Math.round(save.totalKm * 10) / 10 };
}

export function simulateAll(rideCount = 30) {
  return (Object.keys(PARAMETERS) as SimulationScenario[]).map((scenario) => simulateEconomy(scenario, rideCount));
}
