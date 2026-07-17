import type { MissionSnapshot, PlayerSave, Receipt } from '../../types/game';
import { createRegionalFamiliarity } from './RegionalDefaults';

export function recordRegionalRide(save: PlayerSave, mission: MissionSnapshot, receipt: Receipt) {
  const regionIds = [...new Set([mission.pickupRegionId, mission.destinationRegionId].filter((id): id is string => Boolean(id)))];
  if (!regionIds.length) return;
  const kilometersShare = receipt.distanceKm / regionIds.length;
  const corridorId = mission.pickupRegionId && mission.destinationRegionId
    ? `${mission.pickupRegionId}>${mission.destinationRegionId}`
    : regionIds[0];
  for (const regionId of regionIds) {
    const current = save.regionalFamiliarity[regionId] ?? createRegionalFamiliarity(regionId);
    current.completedRides += 1;
    current.kilometers = round(current.kilometers + kilometersShare);
    current.workSeconds = Math.max(0, current.workSeconds + mission.elapsedSeconds);
    current.ratingTotal = round(current.ratingTotal + receipt.rating);
    current.ratingCount += 1;
    current.corridorIds[corridorId] = (current.corridorIds[corridorId] ?? 0) + 1;
    if (mission.pickupRegionId === regionId) current.pickupIds = appendUnique(current.pickupIds, mission.pickupLabel);
    if (mission.destinationRegionId === regionId) current.destinationIds = appendUnique(current.destinationIds, mission.destinationLabel);
    if (current.completedRides >= 5 && stableChance(`${mission.id}:${regionId}`) < 0.12) current.recurringClients += 1;
    save.regionalFamiliarity[regionId] = current;
  }
}

function appendUnique(values: string[], value: string) {
  return [...values.filter((item) => item !== value), value].slice(-24);
}

function stableChance(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0xffffffff;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
