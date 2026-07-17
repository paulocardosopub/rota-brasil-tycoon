import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { VEHICLE_PHYSICS } from '../../src/config/vehiclePhysics';
import { GraphRouter } from '../../src/map/routing/GraphRouter';
import { visibleRoadWidth } from '../../src/map/routing/roadRules';
import type { CityMapChunk, CityMapManifest, LaneData, MapServiceLocation, NavigationGraph, Point, RoadData } from '../../src/types/game';

type AuditSegment = { from: Point; to: Point; halfWidth: number };

class RoadSurfaceAudit {
  private readonly cells = new Map<string, AuditSegment[]>();
  private readonly cellSize = 100;

  constructor(roads: RoadData[]) {
    for (const road of roads) for (let index = 1; index < road.points.length; index += 1) {
      const segment = {
        from: road.points[index - 1],
        to: road.points[index],
        halfWidth: visibleRoadWidth(road) / 2
      };
      const minX = Math.floor((Math.min(segment.from.x, segment.to.x) - segment.halfWidth) / this.cellSize);
      const maxX = Math.floor((Math.max(segment.from.x, segment.to.x) + segment.halfWidth) / this.cellSize);
      const minY = Math.floor((Math.min(segment.from.y, segment.to.y) - segment.halfWidth) / this.cellSize);
      const maxY = Math.floor((Math.max(segment.from.y, segment.to.y) + segment.halfWidth) / this.cellSize);
      for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
        const key = `${x},${y}`;
        const values = this.cells.get(key) ?? [];
        values.push(segment);
        this.cells.set(key, values);
      }
    }
  }

  distanceFromRoad(point: Point) {
    const cellX = Math.floor(point.x / this.cellSize);
    const cellY = Math.floor(point.y / this.cellSize);
    let distance = Number.POSITIVE_INFINITY;
    // Segments are indexed into every cell touched by their full road width,
    // so the point's own cell is sufficient for the required in-asphalt test.
    for (const segment of this.cells.get(`${cellX},${cellY}`) ?? []) {
      distance = Math.min(distance, distanceFromSegment(point, segment.from, segment.to) - segment.halfWidth);
    }
    return distance;
  }
}

const mapRoot = path.resolve('public/data/cities/brasilia');
const manifest = JSON.parse(readFileSync(path.join(mapRoot, 'manifest.json'), 'utf8')) as CityMapManifest;
const graph = JSON.parse(gunzipSync(
  readFileSync(path.join(mapRoot, manifest.graphFile))
).toString('utf8')) as NavigationGraph;
const roads = new Map<string, RoadData>();
const lanes = new Map<string, LaneData>();
for (const entry of manifest.chunks) {
  const chunk = JSON.parse(readFileSync(path.join(mapRoot, entry.file), 'utf8')) as CityMapChunk;
  for (const road of chunk.roads) roads.set(road.id, road);
  for (const lane of chunk.lanes) lanes.set(lane.id, lane);
}
const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const routableCore = largestStrongComponent(graph.nodes);
const starts = graph.nodes.filter((node) =>
  routableCore.has(node.id) && node.edges.some((edge) => !edge.connector)
);
const router = new GraphRouter(graph, [...roads.values()]);
const failures: string[] = [];
const sampledRoutes: Array<{ id: string; route: Point[] }> = [];
let tested = 0;

for (let sample = 0; sample < 96; sample += 1) {
  const start = starts[(sample * 997) % starts.length];
  const edge = start.edges.find((candidate) => !candidate.connector);
  const next = edge ? nodeById.get(edge.to) : undefined;
  const target = starts[(sample * 7_919 + 12_345) % starts.length];
  if (!edge || !next || target.id === start.id) continue;
  const position = { x: (start.x + next.x) / 2, y: (start.y + next.y) / 2 };
  const heading = Math.atan2(next.y - start.y, next.x - start.x);
  const route = router.drivingRoute(position, target, heading);
  tested += 1;
  if (route.length < 2) {
    failures.push(`${start.id}: rota ausente`);
    continue;
  }
  sampledRoutes.push({ id: start.id, route });
  const entryHeading = Math.atan2(route[1].y - route[0].y, route[1].x - route[0].x);
  const entryError = Math.abs(angleDelta(heading, entryHeading));
  // Tiny imported OSM fragments do not represent a meaningful driving
  // direction, but every real entry segment must preserve the car heading.
  if (edge.distance >= 2 && entryError > 0.35) {
    failures.push(`${start.id}: entrada divergiu ${(entryError * 180 / Math.PI).toFixed(1)}°`);
  }
  const end = route[route.length - 1];
  const endDistance = Math.hypot(end.x - target.x, end.y - target.y);
  if (endDistance > 2.5) failures.push(`${start.id}: destino ficou a ${endDistance.toFixed(1)} m da faixa`);
}

const serviceTargets = ['fuel-stations.json', 'workshops.json', 'garages.json']
  .flatMap((filename) => JSON.parse(
    readFileSync(path.join(mapRoot, 'central/services', filename), 'utf8')
  ) as MapServiceLocation[]);
const defaultStart = router.routeStart({ x: 0, y: 0 }) ?? router.nearestRoutePoint({ x: 0, y: 0 });
for (const service of serviceTargets) {
  const route = router.drivingRoute(defaultStart, service.entrance);
  tested += 1;
  if (route.length < 2) failures.push(`spawn → ${service.id}: rota ausente`);
  else sampledRoutes.push({ id: `spawn:${service.id}`, route });
}

const surface = new RoadSurfaceAudit([...roads.values()]);
const graphLaneIds = new Set(graph.nodes.flatMap((node) => node.laneId ? [node.laneId] : []));
const routingLanes = [...lanes.values()].filter((lane) => lane.index === 0);
const missingRoutingLanes = routingLanes.filter((lane) => !graphLaneIds.has(lane.id));
const nodeSurfaceFailures: string[] = [];
const laneSurfaceFailures: string[] = [];
const edgeSurfaceFailures: string[] = [];
const routeSurfaceFailures: string[] = [];
let worstNodeDistance = Number.NEGATIVE_INFINITY;
let worstLaneDistance = Number.NEGATIVE_INFINITY;
let worstEdgeDistance = Number.NEGATIVE_INFINITY;
let worstRouteDistance = Number.NEGATIVE_INFINITY;
const requiredVehicleInset = VEHICLE_PHYSICS.widthMeters / 2;

for (const node of graph.nodes) {
  const road = node.roadSegmentId ? roads.get(node.roadSegmentId) : undefined;
  const distance = road ? distanceFromOwnRoad(node, road) : Number.POSITIVE_INFINITY;
  worstNodeDistance = Math.max(worstNodeDistance, distance);
  if (distance > -requiredVehicleInset) nodeSurfaceFailures.push(`${node.id}: margem ${formatDistance(-distance)} insuficiente`);
}

for (const lane of lanes.values()) {
  const road = roads.get(lane.roadSegmentId);
  if (!road) {
    laneSurfaceFailures.push(`${lane.id}: via ausente`);
    continue;
  }
  for (const point of lane.points) {
    const distance = distanceFromOwnRoad(point, road);
    worstLaneDistance = Math.max(worstLaneDistance, distance);
    if (distance > -requiredVehicleInset) {
      laneSurfaceFailures.push(`${lane.id}: margem ${formatDistance(-distance)} insuficiente`);
      break;
    }
  }
}

for (const node of graph.nodes) for (const edge of node.edges) {
  const target = nodeById.get(edge.to);
  if (!target) continue;
  const length = Math.hypot(target.x - node.x, target.y - node.y);
  const steps = Math.max(1, Math.ceil(length / 3));
  const road = edge.connector ? undefined : roads.get(edge.roadId);
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const point = {
      x: node.x + (target.x - node.x) * progress,
      y: node.y + (target.y - node.y) * progress
    };
    const distance = road ? distanceFromOwnRoad(point, road) : surface.distanceFromRoad(point);
    worstEdgeDistance = Math.max(worstEdgeDistance, distance);
    if (distance > -requiredVehicleInset) {
      edgeSurfaceFailures.push(`${node.id} → ${target.id}: margem ${formatDistance(-distance)} insuficiente`);
      break;
    }
  }
}

// Audit the final polylines returned to the GPS/autopilot too. This catches
// unsafe straight chords introduced when a route is attached or compacted,
// even when every underlying graph edge is valid by itself.
for (const sample of sampledRoutes) for (let index = 1; index < sample.route.length; index += 1) {
  const from = sample.route[index - 1];
  const to = sample.route[index];
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / 2));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const point = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    const distance = surface.distanceFromRoad(point);
    worstRouteDistance = Math.max(worstRouteDistance, distance);
    if (distance > -requiredVehicleInset) {
      routeSurfaceFailures.push(
        `${sample.id} trecho ${index}: margem ${formatDistance(-distance)} insuficiente`
      );
      break;
    }
  }
}

console.log(`Navegação global: ${tested} rotas dirigidas auditadas, ${failures.length} falhas.`);
console.log(
  `Cobertura do grafo: ${graphLaneIds.size}/${routingLanes.length} faixas direcionais principais; `
  + `${missingRoutingLanes.length} fora do componente global; núcleo retornável com ${routableCore.size} nós.`
);
console.log(
  `Superfície viária: ${graph.nodes.length} nós, ${lanes.size} faixas e arestas completas; `
  + `${nodeSurfaceFailures.length + laneSurfaceFailures.length + edgeSurfaceFailures.length + routeSurfaceFailures.length} falhas `
  + `(margem mínima exigida ${formatDistance(requiredVehicleInset)}; `
  + `piores margens ${formatDistance(-worstNodeDistance)}/${formatDistance(-worstLaneDistance)}/`
  + `${formatDistance(-worstEdgeDistance)}/${formatDistance(-worstRouteDistance)}).`
);

const surfaceFailures = [...nodeSurfaceFailures, ...laneSurfaceFailures, ...edgeSurfaceFailures, ...routeSurfaceFailures];
if (failures.length || surfaceFailures.length) {
  console.error([...failures, ...surfaceFailures].slice(0, 40).join('\n'));
  process.exitCode = 1;
}

function distanceFromOwnRoad(point: Point, road: RoadData) {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < road.points.length; index += 1) {
    distance = Math.min(distance, distanceFromSegment(point, road.points[index - 1], road.points[index]));
  }
  return distance - visibleRoadWidth(road) / 2;
}

function distanceFromSegment(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (from.x + dx * progress), point.y - (from.y + dy * progress));
}

function formatDistance(distance: number) {
  return Number.isFinite(distance) ? `${distance.toFixed(2)} m` : '∞';
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function largestStrongComponent(nodes: NavigationGraph['nodes']) {
  const forward = new Map(nodes.map((node) => [node.id, node.edges.map((edge) => edge.to)]));
  const reverse = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const node of nodes) for (const edge of node.edges) reverse.get(edge.to)?.push(node.id);
  const visited = new Set<string>();
  const order: string[] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    const stack: Array<{ id: string; index: number }> = [{ id: node.id, index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbors = forward.get(frame.id) ?? [];
      if (frame.index < neighbors.length) {
        const neighbor = neighbors[frame.index++];
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ id: neighbor, index: 0 });
        }
      } else {
        order.push(frame.id);
        stack.pop();
      }
    }
  }
  visited.clear();
  let largest = new Set<string>();
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const start = order[index];
    if (visited.has(start)) continue;
    const component = new Set<string>([start]);
    const pending = [start];
    visited.add(start);
    while (pending.length) {
      const id = pending.pop()!;
      for (const neighbor of reverse.get(id) ?? []) if (!visited.has(neighbor)) {
        visited.add(neighbor);
        component.add(neighbor);
        pending.push(neighbor);
      }
    }
    if (component.size > largest.size) largest = component;
  }
  return largest;
}
