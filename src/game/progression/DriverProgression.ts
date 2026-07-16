import { GAME_CONFIG } from '../../config/gameConfig';
import type { PlayerSave } from '../../types/game';

export function refreshProgression(save: PlayerSave) {
  save.driverLevel = Math.max(1, Math.floor(save.xp / GAME_CONFIG.progression.xpPerLevel) + 1);
  save.goals.firstRide = save.completedRides >= 1;
  save.goals.fiveRides = save.completedRides >= 5;
  save.goals.firstTip = save.tipsEarned > 0;
  save.goals.firstRefuel = save.ledger.some((entry) => entry.category === 'fuel');
  save.goals.firstWorkshop = save.ledger.some((entry) => entry.category === 'repair');
  save.goals.firstUpgrade = Object.values(save.upgrades).some((level) => level > 0);
  save.goals.rating45 = save.rating >= 4.5 && save.completedRides >= 3;
  save.goals.tenKm = save.totalKm >= 10;
  save.goals.thousandReais = save.totalEarned >= 1_000;
  const target = GAME_CONFIG.progression.regularization;
  save.regularizationReady = save.completedRides >= target.completedRides
    && save.driverLevel >= target.driverLevel
    && save.rating >= target.rating
    && save.totalKm >= target.totalKm
    && save.money >= target.money;
  if (save.professionalStatus !== 'licensed-taxi') {
    save.taxiLicense.status = save.regularizationReady ? 'eligible' : 'not-eligible';
  }
  return save;
}
