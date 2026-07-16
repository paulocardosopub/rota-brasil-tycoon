import { GAME_CONFIG } from '../../config/gameConfig';
import type { UpgradeLevels, VehicleUpgradeId } from '../../types/game';
import { ECONOMY_CONFIG } from './EconomyConfig';
import { roundMoney } from './TransactionLedger';

export function fuelPurchaseCost(liters: number) {
  return roundMoney(Math.max(0, liters) * GAME_CONFIG.services.fuelPricePerLiter);
}

export type WorkshopServiceId = 'diagnosis' | 'quick' | 'partial' | 'full' | 'preventive';

export function workshopPrice(service: WorkshopServiceId, condition: number, wear: number) {
  const base = ECONOMY_CONFIG.workshop[service];
  const severity = service === 'diagnosis' ? 1 : 1 + (100 - condition + wear) / 500;
  return roundMoney(base * severity);
}

export function upgradePrice(id: VehicleUpgradeId, upgrades: UpgradeLevels) {
  const level = upgrades[id];
  return level >= 3 ? null : ECONOMY_CONFIG.upgrades[id].prices[level];
}

export function upgradeEffects(upgrades: UpgradeLevels) {
  return {
    maxSpeedMultiplier: 1 + upgrades.engine * 0.045,
    accelerationMultiplier: 1 + upgrades.engine * 0.055,
    brakingMultiplier: 1 + upgrades.brakes * 0.065,
    steeringMultiplier: 1 + upgrades.tires * 0.035,
    offRoadMultiplier: 1 + upgrades.suspension * 0.08,
    fuelMultiplier: 1 - upgrades.economy * 0.07,
    comfortLevel: upgrades.comfort
  };
}
