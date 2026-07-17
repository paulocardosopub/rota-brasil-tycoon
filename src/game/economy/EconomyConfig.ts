import type { RideCategory, VehicleUpgradeId } from '../../types/game';

export const ECONOMY_CONFIG = {
  fare: {
    base: 7.5,
    perKilometer: 4.7,
    perMinute: 0.5,
    minimum: 9,
    maximum: 56,
    maximumRatingBonus: 0.09,
    categoryMultiplier: { popular: 1, urgent: 1.22, comfort: 1.15 } satisfies Record<RideCategory, number>,
    urgencyBonus: 2.25,
    comfortPerLevel: 0.45,
    maximumTipPercent: 0.09
  },
  regional: {
    preferredShare: 0.7,
    neighborShare: 0.2,
    longDistanceShare: 0.1,
    knownEfficiencyBonus: 0.02,
    favoriteEfficiencyBonus: 0.04
  },
  workshop: {
    diagnosis: 18,
    quick: 44,
    partial: 100,
    full: 220,
    preventive: 72
  },
  upgrades: {
    engine: { name: 'Motor', prices: [180, 390, 720], requirement: [0, 2, 4] },
    brakes: { name: 'Freios', prices: [140, 310, 590], requirement: [0, 2, 4] },
    tires: { name: 'Pneus', prices: [130, 295, 560], requirement: [0, 2, 4] },
    suspension: { name: 'Suspensão', prices: [150, 330, 610], requirement: [0, 2, 4] },
    economy: { name: 'Economia', prices: [165, 360, 680], requirement: [0, 2, 4] },
    comfort: { name: 'Conforto', prices: [120, 270, 520], requirement: [0, 2, 4] }
  } satisfies Record<VehicleUpgradeId, { name: string; prices: number[]; requirement: number[] }>,
  wear: {
    perKilometer: 0.017,
    aggressiveMultiplier: 1.8,
    lowConditionMultiplier: 1.25
  },
  fleet: {
    grossBasePerRide: 13.7,
    serviceFactor: 0.045,
    efficiencyFactor: 0.026,
    sedanBonus: 1.4,
    sedanMaintenancePerKilometer: 0.22,
    hatchMaintenancePerKilometer: 0.17,
    wearPerKilometer: 0.02
  }
} as const;

export const UPGRADE_IDS = Object.keys(ECONOMY_CONFIG.upgrades) as VehicleUpgradeId[];
