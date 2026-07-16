import { GAME_CONFIG } from '../../config/gameConfig';
import type { PlayerSave } from '../../types/game';
import { EconomyService } from '../economy/EconomyService';
import { refreshProgression } from './DriverProgression';

export function regularizationRequirements(save: PlayerSave) {
  refreshProgression(save);
  const target = GAME_CONFIG.progression.regularization;
  return [
    { id: 'rides', label: `${target.completedRides} corridas concluídas`, complete: save.completedRides >= target.completedRides },
    { id: 'level', label: `Nível ${target.driverLevel} de motorista`, complete: save.driverLevel >= target.driverLevel },
    { id: 'rating', label: `Avaliação ${target.rating.toFixed(2)} ou maior`, complete: save.rating >= target.rating },
    { id: 'distance', label: `${target.totalKm} km rodados`, complete: save.totalKm >= target.totalKm },
    { id: 'reserve', label: `${target.money.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} reservados`, complete: save.money >= target.money }
  ];
}

export function canRegularize(save: PlayerSave) {
  return regularizationRequirements(save).every((requirement) => requirement.complete)
    && save.taxiLicense.status !== 'licensed';
}

export function regularizeTaxi(save: PlayerSave, requestId: string) {
  if (save.taxiLicense.status === 'licensed') return { applied: false, reason: 'already-licensed' as const };
  if (!canRegularize(save)) return { applied: false, reason: 'requirements' as const };
  const result = new EconomyService(save).expense(
    GAME_CONFIG.taxi.regularizationCost, 'license', 'Regularização simplificada de taxista', requestId, false,
    { ownerId: save.ownerId, fleetId: save.fleet.id, vehicleId: save.activeVehicleId, driverId: save.ownerId, tripId: 'regularization', gameplayProcess: true }
  );
  if (!result.applied) return result;
  const now = new Date().toISOString();
  save.professionalStatus = 'licensed-taxi';
  save.taxiLicense = {
    ...save.taxiLicense, status: 'licensed', requestedAt: now, issuedAt: now,
    costPaid: GAME_CONFIG.taxi.regularizationCost, idempotencyKey: requestId
  };
  save.regularizationReady = true;
  return { applied: true, transaction: result.transaction };
}

export function convertActiveVehicleToTaxi(save: PlayerSave, requestId: string) {
  if (save.professionalStatus !== 'licensed-taxi') return { applied: false, reason: 'not-licensed' as const };
  const vehicle = save.fleet.vehicles.find((candidate) => candidate.id === save.activeVehicleId);
  if (!vehicle) return { applied: false, reason: 'vehicle-missing' as const };
  if (vehicle.taxiLicensed) return { applied: false, reason: 'already-converted' as const };
  const result = new EconomyService(save).expense(
    GAME_CONFIG.taxi.conversionCost, 'license', `Conversão ${vehicle.model} em Táxi Popular`, requestId, false,
    { ownerId: save.ownerId, fleetId: save.fleet.id, vehicleId: vehicle.id, tripId: 'none', driverId: save.ownerId }
  );
  if (!result.applied) return result;
  vehicle.taxiLicensed = true;
  vehicle.taxiVisualEnabled = true;
  vehicle.taxiRegistrationId = `taxi-${vehicle.id}`;
  vehicle.updatedAt = new Date().toISOString();
  vehicle.stateVersion += 1;
  return { applied: true, transaction: result.transaction, vehicle };
}
