import type { EmployeeRegionalPreferences, RegionalFamiliarity } from '../../types/game';

export const DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES: EmployeeRegionalPreferences = {
  preferredRegionId: 'any', allowedRegionIds: [], maximumDistanceKm: 18,
  acceptLongTrips: true, returnToPreferredRegion: true, returnToGarage: true,
  preferredFuelServiceId: null, preferredWorkshopServiceId: null,
  minimumCondition: 45, minimumFuelPercent: 20
};

export function createRegionalFamiliarity(regionId: string): RegionalFamiliarity {
  return {
    regionId, completedRides: 0, kilometers: 0, pickupIds: [], destinationIds: [], corridorIds: {},
    workSeconds: 0, ratingTotal: 0, ratingCount: 0, recurringClients: 0
  };
}
