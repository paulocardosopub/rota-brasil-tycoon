import type { LaneData, NavigationGraph, RoadData, RoadPoint } from '../../types/game';
import { offsetToRightOfTravel } from '../routing/roadRules';

export interface RawRoadSpec {
  id: string;
  points: RoadPoint[];
  tags: Record<string, string>;
}

export interface RoadOverride {
  id: string;
  segmentIds: string[];
  lanes?: number;
  lanesForward?: number;
  lanesBackward?: number;
  width?: number;
  oneway?: boolean;
}

const DEFAULT_LANES: Record<string, number> = {
  motorway: 3, motorway_link: 1, trunk: 3, trunk_link: 1,
  primary: 2, primary_link: 1, secondary: 2, secondary_link: 1,
  tertiary: 1, tertiary_link: 1, residential: 1, unclassified: 1,
  living_street: 2, service: 1
};

const DEFAULT_SPEED: Record<string, number> = {
  motorway: 80, trunk: 70, primary: 60, secondary: 50,
  tertiary: 50, residential: 40, unclassified: 40, living_street: 20, service: 20
};

export function canonicalizeRoads(rawRoads: RawRoadSpec[], overrides: RoadOverride[] = []): RoadData[] {
  const overrideByRoad = new Map<string, RoadOverride>();
  for (const override of overrides) for (const id of override.segmentIds) overrideByRoad.set(id, override);

  const drafts = rawRoads.flatMap((raw) => {
    if (raw.points.length < 2) return [];
    const tags = raw.tags;
    const highway = tags.highway;
    const reverse = tags.oneway === '-1';
    const oneway = ['yes', 'true', '1', '-1'].includes(tags.oneway ?? '')
      || highway === 'motorway' || tags.junction === 'roundabout';
    const explicitTotal = numberTag(tags.lanes);
    const explicitForward = numberTag(tags['lanes:forward']);
    const explicitBackward = numberTag(tags['lanes:backward']);
    const fallbackPerDirection = DEFAULT_LANES[highway] ?? 1;
    const fallbackTotal = oneway ? fallbackPerDirection : Math.max(2, fallbackPerDirection * 2);
    const lanes = Math.max(1, Math.round(explicitTotal ?? sumDefined(explicitForward, explicitBackward) ?? fallbackTotal));
    const lanesForward = oneway ? lanes : Math.max(1, Math.round(explicitForward ?? Math.ceil(lanes / 2)));
    const lanesBackward = oneway ? 0 : Math.max(1, Math.round(explicitBackward ?? lanes - lanesForward));
    const laneTotal = lanesForward + lanesBackward;
    const width = numberTag(tags.width) ?? laneTotal * 3.35 + (tags.shoulder ? 1.2 : 0);
    const name = tags.name ?? tags.ref ?? `Via ${raw.id}`;
    const corridorId = corridorKey(name, tags.ref, highway);
    return [{
      id: raw.id,
      osmWayId: raw.id,
      name,
      ref: tags.ref,
      highway,
      oneway,
      lanes: laneTotal,
      lanesForward,
      lanesBackward,
      width,
      speedLimitKmh: Math.max(10, Math.round(numberTag(tags.maxspeed) ?? DEFAULT_SPEED[highway] ?? 30)),
      layer: Math.round(numberTag(tags.layer) ?? 0),
      bridge: tags.bridge !== undefined && tags.bridge !== 'no',
      tunnel: tags.tunnel !== undefined && tags.tunnel !== 'no',
      surface: tags.surface ?? 'asphalt',
      access: tags.access,
      junction: tags.junction,
      corridorId,
      points: reverse ? [...raw.points].reverse() : raw.points,
      _explicitLanes: explicitTotal !== undefined || explicitForward !== undefined || explicitBackward !== undefined,
      _explicitWidth: numberTag(tags.width) !== undefined
    }];
  });

  // Missing tags on short OSM fragments inherit a stable value from the full corridor.
  const byCorridor = groupBy(drafts, (road) => road.corridorId);
  for (const roads of byCorridor.values()) {
    const laneMode = weightedMode(roads.filter((road) => road._explicitLanes).map((road) => [road.lanes, roadLength(road)]));
    const widthMedian = median(roads.filter((road) => road._explicitWidth).map((road) => road.width));
    for (const road of roads) {
      if (!road._explicitLanes && laneMode !== undefined) {
        road.lanes = laneMode;
        road.lanesForward = road.oneway ? laneMode : Math.max(1, Math.ceil(laneMode / 2));
        road.lanesBackward = road.oneway ? 0 : Math.max(1, laneMode - road.lanesForward);
      }
      if (!road._explicitWidth) road.width = widthMedian ?? road.lanes * 3.35;
      const override = overrideByRoad.get(road.id);
      if (override) {
        if (override.oneway !== undefined) road.oneway = override.oneway;
        if (override.lanes !== undefined) road.lanes = override.lanes;
        if (override.lanesForward !== undefined) road.lanesForward = override.lanesForward;
        if (override.lanesBackward !== undefined) road.lanesBackward = override.lanesBackward;
        if (override.width !== undefined) road.width = override.width;
      }
      road.lanes = Math.max(1, (road.lanesForward ?? 1) + (road.lanesBackward ?? 0));
    }
  }

  return drafts.map(({ _explicitLanes: _lanes, _explicitWidth: _width, ...road }) => road);
}

export function buildLaneGraph(roads: RoadData[], chunkSizeMeters = 800): { lanes: LaneData[]; graph: NavigationGraph } {
  const lanes: LaneData[] = [];
  const graphNodes = new Map<string, NavigationGraph['nodes'][number]>();
  const arrivals = new Map<string, Array<{ lane: LaneData; nodeId: string; heading: number }>>();
  const departures = new Map<string, Array<{ lane: LaneData; nodeId: string; heading: number }>>();

  for (const road of roads) {
    const directions: Array<{ name: 'forward' | 'backward'; count: number; points: RoadPoint[] }> = [
      { name: 'forward', count: road.lanesForward ?? (road.oneway ? road.lanes : Math.max(1, Math.ceil(road.lanes / 2))), points: road.points }
    ];
    if (!road.oneway) directions.push({
      name: 'backward',
      count: road.lanesBackward ?? Math.max(1, Math.floor(road.lanes / 2)),
      points: [...road.points].reverse()
    });
    for (const direction of directions) for (let laneIndex = 0; laneIndex < direction.count; laneIndex += 1) {
      const laneWidth = Math.min(4.2, Math.max(2.7, road.width / Math.max(1, road.lanes)));
      const offset = laneWidth * (direction.count - laneIndex - 0.5);
      const points = direction.points.map((point, index, all) => {
        const from = all[Math.max(0, index - 1)];
        const to = all[Math.min(all.length - 1, index + 1)];
        return { ...offsetToRightOfTravel(point, from, to, offset), sourceNodeId: point.nodeId };
      });
      const id = `lane:${road.id}:${direction.name}:${laneIndex}`;
      const chunkIds = [...new Set(points.map((point) => chunkIdFor(point, chunkSizeMeters)))];
      const lane: LaneData = {
        id, roadSegmentId: road.id, corridorId: road.corridorId ?? road.id,
        direction: direction.name, index: laneIndex, width: laneWidth,
        speedLimitKmh: road.speedLimitKmh ?? 40, points,
        startNodeId: `${id}:0`, endNodeId: `${id}:${points.length - 1}`,
        nextLaneIds: [], neighborLaneIds: [], movements: ['straight', 'left', 'right'],
        layer: road.layer ?? 0, chunkIds
      };
      lanes.push(lane);
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const nodeId = `${id}:${index}`;
        const edges = index < points.length - 1 ? [{
          to: `${id}:${index + 1}`,
          distance: distance(point, points[index + 1]),
          roadId: road.id,
          laneId: id,
          highway: road.highway
        }] : [];
        graphNodes.set(nodeId, {
          id: nodeId, x: point.x, y: point.y, laneId: id, roadSegmentId: road.id,
          sourceNodeId: point.sourceNodeId, chunkId: chunkIdFor(point, chunkSizeMeters), edges
        });
        if (index > 0) addGrouped(arrivals, point.sourceNodeId, {
          lane, nodeId, heading: Math.atan2(point.y - points[index - 1].y, point.x - points[index - 1].x)
        });
        if (index < points.length - 1) addGrouped(departures, point.sourceNodeId, {
          lane, nodeId,
          heading: Math.atan2(points[index + 1].y - point.y, points[index + 1].x - point.x)
        });
      }
    }
  }

  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));
  for (const lane of lanes) {
    lane.neighborLaneIds = lanes
      .filter((candidate) => candidate.roadSegmentId === lane.roadSegmentId && candidate.direction === lane.direction && candidate.id !== lane.id)
      .map((candidate) => candidate.id);
  }
  for (const [sourceNodeId, incoming] of arrivals) {
    const outgoing = departures.get(sourceNodeId) ?? [];
    for (const arrival of incoming) {
      const legal = outgoing.filter((departure) => {
        if (departure.lane.id === arrival.lane.id) return false;
        if (departure.lane.layer !== arrival.lane.layer) return false;
        if (departure.lane.roadSegmentId === arrival.lane.roadSegmentId && departure.lane.direction !== arrival.lane.direction) return false;
        return Math.abs(angleDelta(arrival.heading, departure.heading)) < Math.PI * 0.86;
      });
      const byRoad = groupBy(legal, (departure) => departure.lane.roadSegmentId);
      for (const candidates of byRoad.values()) {
        const departure = candidates[Math.min(arrival.lane.index, candidates.length - 1)];
        const toLane = departure.lane;
        const fromNode = graphNodes.get(arrival.nodeId)!;
        const target = graphNodes.get(departure.nodeId)!;
        fromNode.edges.push({
          to: target.id, distance: Math.max(0.5, distance(fromNode, target)),
          roadId: toLane.roadSegmentId, laneId: toLane.id,
          highway: roadFor(roads, toLane.roadSegmentId)?.highway, connector: true
        });
        arrival.lane.nextLaneIds.push(toLane.id);
      }
    }
  }
  // Ensure stable arrays and remove connectors that point to absent data.
  for (const node of graphNodes.values()) node.edges = node.edges.filter((edge) => graphNodes.has(edge.to));
  for (const lane of laneById.values()) lane.nextLaneIds = [...new Set(lane.nextLaneIds)];
  // The complete lane inventory stays in chunk files. The global hierarchy
  // uses one stable routing lane per direction, which keeps long routes light
  // while still preserving legal direction and lane-centre geometry.
  const routingLaneIds = new Set(lanes.filter((lane) => lane.index === 0).map((lane) => lane.id));
  const routingNodes = [...graphNodes.values()].filter((node) => node.laneId && routingLaneIds.has(node.laneId));
  const routingNodeIds = new Set(routingNodes.map((node) => node.id));
  for (const node of routingNodes) node.edges = node.edges.filter((edge) => routingNodeIds.has(edge.to));
  const coreNodeIds = largestStrongComponent(routingNodes);
  const coreNodes = routingNodes.filter((node) => coreNodeIds.has(node.id));
  for (const node of coreNodes) node.edges = node.edges.filter((edge) => coreNodeIds.has(edge.to));
  return { lanes, graph: { kind: 'lane', version: '0.7.0', nodes: coreNodes } };
}

export function chunkIdFor(point: { x: number; y: number }, size = 800) {
  return `${Math.floor(point.x / size)}_${Math.floor(point.y / size)}`;
}

export function corridorKey(name: string, ref: string | undefined, highway: string) {
  return `${normalize(ref || name)}:${highway.replace(/_link$/, '')}`;
}

function numberTag(value: string | undefined) {
  const match = value?.replace(',', '.').match(/-?[\d.]+/);
  const parsed = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sumDefined(a: number | undefined, b: number | undefined) {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
}

function weightedMode(values: Array<[number, number]>) {
  const weights = new Map<number, number>();
  for (const [value, weight] of values) weights.set(value, (weights.get(value) ?? 0) + Math.max(1, weight));
  return [...weights].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function roadLength(road: Pick<RoadData, 'points'>) {
  let total = 0;
  for (let index = 1; index < road.points.length; index += 1) total += distance(road.points[index - 1], road.points[index]);
  return total;
}

function addGrouped<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) addGrouped(groups, keyFor(value), value);
  return groups;
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roadFor(roads: RoadData[], id: string) {
  return roads.find((road) => road.id === id);
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
