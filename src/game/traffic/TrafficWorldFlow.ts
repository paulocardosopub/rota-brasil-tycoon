import type { DirectionalTrafficFlow, MapRegion } from '../../types/game';

export function selectTrafficDestinationRegion(regions: readonly MapRegion[], index: number, flow: DirectionalTrafficFlow) {
  if (!regions.length) return null;
  const preferred = flow === 'toward-central'
    ? regions.filter((region) => ['central', 'commercial', 'university'].includes(region.predominantType))
    : flow === 'toward-residential'
      ? regions.filter((region) => region.predominantType === 'residential' || ['lago-sul', 'sudoeste', 'jardim-botanico'].includes(region.id))
      : regions.filter((region) => region.playable);
  const pool = preferred.length ? preferred : regions;
  return pool[(Math.max(0, Math.floor(index)) * 7 + 3) % pool.length] ?? null;
}

export function targetNpcPopulation(capacity: number, densityMultiplier: number, worldMultiplier: number, reservedSlots: number) {
  const requested = Math.max(8, Math.round(Math.max(0, capacity) * densityMultiplier * worldMultiplier));
  return Math.max(0, requested - Math.max(0, Math.floor(reservedSlots)));
}
