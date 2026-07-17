import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../config/gameConfig';
import { GraphRouter } from '../../map/routing/GraphRouter';
import type { NavigationGraph, RoadData } from '../../types/game';
import graphData from '../../../public/data/cities/brasilia/central/navigation-graph.json';
import roadsData from '../../../public/data/cities/brasilia/central/roads.json';
import { automaticThrottle, missionApproachTargetSpeed } from '../systems/Autopilot';
import { advanceActiveRoute, pointAlongRoute, routeRemainingDistance } from '../systems/RouteProgress';
import { guidanceForRoute } from '../systems/RouteSteeringAssist';
import { RoadSurfaceIndex } from '../systems/RoadSurfaceIndex';
import { VehicleController } from '../systems/VehicleController';
import { FleetRouteHealth } from './FleetRouteHealth';
import { buildFleetWaypoints } from './FleetRoutePlan';

const roads = roadsData as RoadData[];
const graph = graphData as NavigationGraph;

describe('funcionário no mapa real', () => {
  it('conclui destinos consecutivos mesmo recriando a rota no meio da rua', () => {
    const router = new GraphRouter(graph, roads);
    const surface = new RoadSurfaceIndex(roads);
    const garage = { x: -744.43, y: 55.13 };
    const waypoints = buildFleetWaypoints(router.candidates(100), [], garage, 8);
    const vehicle = new VehicleController(garage, 0, surface);
    vehicle.alignToRoad(true, 0);
    let recoveries = 0;

    for (const [targetIndex, target] of waypoints.slice(1, 8).entries()) {
      let route = router.drivingRoute(vehicle.position, target, vehicle.rotation);
      expect(route.length, `rota ${targetIndex + 1}`).toBeGreaterThan(1);
      const maximumFrames = Math.ceil(router.distance(route) / 2.5 * 30) + 3_600;
      const health = new FleetRouteHealth();
      health.reset(routeRemainingDistance(route, vehicle.position), vehicle.rotation);
      let arrived = false;
      let lastTargetDistance = Number.POSITIVE_INFINITY;
      let lastRouteRemaining = Number.POSITIVE_INFINITY;

      for (let frame = 0; frame < maximumFrames; frame += 1) {
        const targetDistance = Math.hypot(vehicle.position.x - target.x, vehicle.position.y - target.y);
        lastTargetDistance = targetDistance;
        if (targetDistance <= 9 && Math.abs(vehicle.speed) < 1.2) {
          arrived = true;
          break;
        }

        // Recreates the detailed layer repeatedly, including between graph nodes.
        if (frame === 360) {
          route = router.drivingRoute(vehicle.position, target, vehicle.rotation);
          health.routeReplanned(routeRemainingDistance(route, vehicle.position), vehicle.rotation);
        }
        expect(route.length, `replanejamento ${targetIndex + 1}`).toBeGreaterThan(1);

        const guidance = guidanceForRoute(
          vehicle.position,
          vehicle.rotation,
          vehicle.speed,
          route,
          GAME_CONFIG.vehicle.autopilotCruiseSpeedMps * 0.88,
          GAME_CONFIG.vehicle.brakeMps2
        );
        const targetSpeed = Math.min(
          guidance.targetSpeedMps,
          missionApproachTargetSpeed(targetDistance, 9, GAME_CONFIG.vehicle.brakeMps2, GAME_CONFIG.vehicle.autopilotCruiseSpeedMps * 0.88)
        );
        vehicle.update({
          throttle: automaticThrottle(Math.abs(vehicle.speed), targetSpeed),
          steering: targetDistance > 9 ? guidance.steering : 0,
          handbrake: false,
          assistanceEnabled: true,
          assistanceHeading: guidance.preferredRoadHeading,
          assistanceRoadAnchor: guidance.roadAnchor
        }, 1 / 30, 18);

        const progress = advanceActiveRoute(route, vehicle.position);
        route = progress.route;
        lastRouteRemaining = progress.remainingMeters;
        const recovery = health.update({
          deltaSeconds: 1 / 30,
          deviationMeters: progress.deviationMeters,
          remainingMeters: progress.remainingMeters,
          rotation: vehicle.rotation,
          speedMps: vehicle.speed,
          shouldBeMoving: targetSpeed > 1.5
        });
        if (recovery) {
          recoveries += 1;
          route = router.drivingRoute(vehicle.position, target, vehicle.rotation);
          if (recovery.repositionAhead) {
            const anchor = pointAlongRoute(route, 8);
            const headingPoint = pointAlongRoute(route, 13);
            const heading = Math.atan2(headingPoint.y - anchor.y, headingPoint.x - anchor.x);
            vehicle.teleport(anchor);
            vehicle.recoverAutopilotToLane(heading);
          } else {
            vehicle.recoverAutopilotToLane(guidance.preferredRoadHeading);
          }
          health.routeReplanned(routeRemainingDistance(route, vehicle.position), vehicle.rotation);
        }
      }

      expect(
        arrived,
        `destino ${targetIndex + 1}: alvo=${lastTargetDistance.toFixed(1)}m rota=${lastRouteRemaining.toFixed(1)}m posição=${vehicle.position.x.toFixed(1)},${vehicle.position.y.toFixed(1)} recuperações=${recoveries}`
      ).toBe(true);
    }

    expect(recoveries).toBeLessThanOrEqual(4);
  }, 30_000);
});
