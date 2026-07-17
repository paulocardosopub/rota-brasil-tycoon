import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import { GraphRouter } from '../../map/routing/GraphRouter';
import type { NavigationGraph, RoadData } from '../../types/game';
import graphData from '../../../public/data/cities/brasilia/central/navigation-graph.json';
import roadsData from '../../../public/data/cities/brasilia/central/roads.json';
import { MissionSystem } from '../missions/MissionSystem';
import { automaticThrottle, missionApproachTargetSpeed } from './Autopilot';
import { guidanceForRoute } from './RouteSteeringAssist';
import { RoadSurfaceIndex } from './RoadSurfaceIndex';
import { VehicleController } from './VehicleController';

const roads = roadsData as RoadData[];
const graph = graphData as NavigationGraph;

describe('piloto automático no mapa real', () => {
  it('conclui rotas representativas sem se perder em curvas e cruzamentos', () => {
    const router = new GraphRouter(graph, roads);
    const surface = new RoadSurfaceIndex(roads);
    const candidates = router.candidates(80);
    const pairs = [[3, 28], [19, 54], [43, 81], [72, 111], [105, 147], [138, 186]];

    for (const [startIndex, targetIndex] of pairs) {
      const start = candidates[startIndex % candidates.length];
      const destination = candidates[targetIndex % candidates.length];
      const progress = Object.create(MissionSystem.prototype) as MissionSystem;
      progress.route = router.drivingRoute(start, destination);
      expect(progress.route.length).toBeGreaterThan(2);

      const initialHeading = Math.atan2(
        progress.route[1].y - progress.route[0].y,
        progress.route[1].x - progress.route[0].x
      );
      const vehicle = new VehicleController(progress.route[0], initialHeading, surface);
      vehicle.alignToRoad(true, initialHeading);
      let offRouteSeconds = 0;
      let recalculations = 0;
      const maximumFrames = Math.ceil(router.distance(progress.route) / 3 * 30) + 2_400;

      for (let frame = 0; frame < maximumFrames; frame += 1) {
        const distanceToDestination = Math.hypot(
          vehicle.position.x - destination.x,
          vehicle.position.y - destination.y
        );
        if (distanceToDestination <= GAME_CONFIG.mission.autopilotInteractionRadiusMeters) break;

        const guidance = guidanceForRoute(
          vehicle.position,
          vehicle.rotation,
          vehicle.speed,
          progress.route,
          GAME_CONFIG.vehicle.autopilotCruiseSpeedMps,
          GAME_CONFIG.vehicle.brakeMps2
        );
        const targetSpeed = Math.min(
          guidance.targetSpeedMps,
          missionApproachTargetSpeed(
            distanceToDestination,
            GAME_CONFIG.mission.autopilotInteractionRadiusMeters,
            GAME_CONFIG.vehicle.brakeMps2,
            GAME_CONFIG.vehicle.autopilotCruiseSpeedMps
          )
        );
        vehicle.update({
          throttle: automaticThrottle(Math.abs(vehicle.speed), targetSpeed),
          steering: guidance.steering,
          handbrake: false,
          assistanceEnabled: true,
          assistanceHeading: guidance.preferredRoadHeading,
          assistanceRoadAnchor: guidance.roadAnchor
        }, 1 / 30, 18);

        const deviation = progress.advanceRoute(vehicle.position);
        offRouteSeconds = deviation > 28 ? offRouteSeconds + 1 / 30 : 0;
        if (offRouteSeconds > 2.5) {
          progress.route = router.drivingRoute(vehicle.position, destination);
          recalculations += 1;
          offRouteSeconds = 0;
        }
      }

      const finalDistance = Math.hypot(vehicle.position.x - destination.x, vehicle.position.y - destination.y);
      expect(finalDistance, `${start.id} -> ${destination.id}`).toBeLessThanOrEqual(
        GAME_CONFIG.mission.autopilotInteractionRadiusMeters
      );
      expect(recalculations, `${start.id} -> ${destination.id}`).toBeLessThanOrEqual(2);
    }
  }, 20_000);
});
