import type { Point } from '../../types/game';
import { advanceActiveRoute } from '../systems/RouteProgress';

export function updateServiceNavigation(
  route: Point[],
  position: Point,
  deltaSeconds: number,
  previousOffRouteSeconds: number,
  serviceDistanceMeters: number,
  interactionRadiusMeters: number
) {
  const progress = advanceActiveRoute(route, position, 28);
  const offRouteSeconds = progress.deviationMeters > 28 ? previousOffRouteSeconds + deltaSeconds : 0;
  return {
    route: progress.route,
    offRouteSeconds,
    shouldRecalculate: offRouteSeconds > 2.5 && serviceDistanceMeters > interactionRadiusMeters
  };
}
