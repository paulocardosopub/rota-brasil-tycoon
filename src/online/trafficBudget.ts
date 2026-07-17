export interface MixedTrafficCounts {
  nearbyPlayers: number;
  onlineEmployees: number;
  offlineFleetVehicles: number;
  missionVehicles: number;
}

export function mixedTrafficBudget(target: number, counts: MixedTrafficCounts) {
  const protectedVehicles = Math.max(0, counts.nearbyPlayers) + Math.max(0, counts.onlineEmployees) + Math.max(0, counts.offlineFleetVehicles) + Math.max(0, counts.missionVehicles);
  return {
    target,
    protectedVehicles,
    ambientNpcs: Math.max(0, target - protectedVehicles),
    npcReplacements: Math.min(target, protectedVehicles),
    total: Math.max(target, protectedVehicles)
  };
}
