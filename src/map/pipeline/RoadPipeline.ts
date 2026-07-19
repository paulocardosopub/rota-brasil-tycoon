import type { LaneData, NavigationGraph, Point, RoadData, RoadPoint } from '../../types/game';
import { offsetToRightOfTravel, visibleRoadWidthAt } from '../routing/roadRules';

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

type RoadDraft = RoadData & {
  _explicitLanes: boolean;
  _explicitWidth: boolean;
  _hasTurnLanes: boolean;
  _locked: boolean;
};

export interface RoadNormalizationOptions {
  shortOscillationMeters: number;
  transitionMeters: number;
  laneWidthMeters: number;
  minimumLaneWidthMeters: number;
  minimumTaperLaneWidthMeters: number;
  maximumLaneWidthMeters: number;
  maximumWidthGradientPerMeter: number;
}

export const DEFAULT_ROAD_NORMALIZATION: RoadNormalizationOptions = {
  shortOscillationMeters: 180,
  transitionMeters: 60,
  laneWidthMeters: 3.35,
  minimumLaneWidthMeters: 2.7,
  minimumTaperLaneWidthMeters: 2.1,
  maximumLaneWidthMeters: 4.2,
  maximumWidthGradientPerMeter: 0.12
};

export interface PackedNavigationGraph {
  kind: 'packed-lane';
  version: string;
  precision: number;
  roads: string[];
  highways: string[];
  nodes: Array<[
    number,
    number,
    Array<[number, number, number, number, 0 | 1]>
  ]>;
}

// OSM's `lanes` tag is the total for a two-way road, but a count per
// carriageway for the overwhelmingly one-way motorway/trunk geometries. Keep
// separate fallbacks so an untagged primary/secondary road never becomes a
// four-lane avenue merely because it accepts traffic in both directions.
const DEFAULT_ONEWAY_LANES: Record<string, number> = {
  motorway: 3, motorway_link: 1, trunk: 3, trunk_link: 1,
  primary: 2, primary_link: 1, secondary: 2, secondary_link: 1,
  tertiary: 1, tertiary_link: 1, residential: 1, unclassified: 1,
  living_street: 1, service: 1
};

const DEFAULT_TWOWAY_LANES: Record<string, number> = {
  motorway: 4, motorway_link: 2, trunk: 4, trunk_link: 2,
  primary: 2, primary_link: 2, secondary: 2, secondary_link: 2,
  tertiary: 2, tertiary_link: 2, residential: 2, unclassified: 2,
  living_street: 2, service: 2
};

const DEFAULT_SPEED: Record<string, number> = {
  motorway: 80, trunk: 70, primary: 60, secondary: 50,
  tertiary: 50, residential: 40, unclassified: 40, living_street: 20, service: 20
};

export function canonicalizeRoads(
  rawRoads: RawRoadSpec[],
  overrides: RoadOverride[] = [],
  normalization: RoadNormalizationOptions = DEFAULT_ROAD_NORMALIZATION
): RoadData[] {
  const overrideByRoad = new Map<string, RoadOverride>();
  for (const override of overrides) for (const id of override.segmentIds) overrideByRoad.set(id, override);

  const drafts: RoadDraft[] = rawRoads.flatMap((raw): RoadDraft[] => {
    if (raw.points.length < 2) return [];
    const tags = raw.tags;
    const highway = tags.highway;
    const reverse = tags.oneway === '-1';
    const oneway = ['yes', 'true', '1', '-1'].includes(tags.oneway ?? '')
      || highway === 'motorway' || tags.junction === 'roundabout';
    const explicitTotal = numberTag(tags.lanes);
    const explicitForward = numberTag(tags['lanes:forward']);
    const explicitBackward = numberTag(tags['lanes:backward']);
    const fallbackTotal = oneway
      ? DEFAULT_ONEWAY_LANES[highway] ?? 1
      : DEFAULT_TWOWAY_LANES[highway] ?? 2;
    const lanes = Math.max(1, Math.round(explicitTotal ?? sumDefined(explicitForward, explicitBackward) ?? fallbackTotal));
    const lanesForward = oneway ? lanes : Math.max(1, Math.round(explicitForward ?? Math.ceil(lanes / 2)));
    const lanesBackward = oneway ? 0 : Math.max(1, Math.round(explicitBackward ?? lanes - lanesForward));
    const laneTotal = lanesForward + lanesBackward;
    const taggedWidth = numberTag(tags.width);
    const shoulderWidth = tags.shoulder && tags.shoulder !== 'no' ? 1.2 : 0;
    const width = realisticRoadWidth(taggedWidth, laneTotal, shoulderWidth, normalization);
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
      _explicitWidth: taggedWidth !== undefined,
      _hasTurnLanes: Object.keys(tags).some((key) => key.startsWith('turn:lanes')),
      _locked: overrideByRoad.has(raw.id)
    }];
  });

  // Missing tags on short OSM fragments inherit a stable value from the full corridor.
  const byCorridor = groupBy(drafts, (road) => road.corridorId ?? road.id);
  for (const roads of byCorridor.values()) {
    const laneMode = weightedMode(roads.filter((road) => road._explicitLanes).map((road) => [road.lanes, roadLength(road)]));
    const widthMedian = median(roads.filter((road) => road._explicitWidth).map((road) => road.width));
    for (const road of roads) {
      if (!road._explicitLanes && laneMode !== undefined) {
        road.lanes = laneMode;
        road.lanesForward = road.oneway ? laneMode : Math.max(1, Math.ceil(laneMode / 2));
        road.lanesBackward = road.oneway ? 0 : Math.max(1, laneMode - road.lanesForward);
      }
      if (!road._explicitWidth) road.width = widthMedian ?? road.lanes * normalization.laneWidthMeters;
      const override = overrideByRoad.get(road.id);
      if (override) {
        if (override.oneway !== undefined) road.oneway = override.oneway;
        if (override.lanes !== undefined) road.lanes = override.lanes;
        if (override.lanesForward !== undefined) road.lanesForward = override.lanesForward;
        if (override.lanesBackward !== undefined) road.lanesBackward = override.lanesBackward;
        if (override.width !== undefined) road.width = override.width;
      }
      road.lanes = Math.max(1, (road.lanesForward ?? 1) + (road.lanesBackward ?? 0));
      road.width = realisticRoadWidth(road.width, road.lanes, 0, normalization);
    }
  }

  normalizeConnectedCorridors(drafts, normalization);

  return drafts.map(({ _explicitLanes: _lanes, _explicitWidth: _width, _hasTurnLanes: _turns, _locked: _locked, ...road }) => road);
}

export function buildLaneGraph(roads: RoadData[], chunkSizeMeters = 800): { lanes: LaneData[]; graph: NavigationGraph } {
  const lanes: LaneData[] = [];
  const graphNodes = new Map<string, NavigationGraph['nodes'][number]>();
  const arrivals = new Map<string, Array<{ lane: LaneData; nodeId: string; heading: number }>>();
  const departures = new Map<string, Array<{ lane: LaneData; nodeId: string; heading: number }>>();

  for (const road of roads) {
    const directions: Array<{ name: 'forward' | 'backward'; count: number; points: RoadPoint[]; widths: number[] }> = [
      {
        name: 'forward',
        count: road.lanesForward ?? (road.oneway ? road.lanes : Math.max(1, Math.ceil(road.lanes / 2))),
        points: road.points,
        widths: road.points.map((_, index) => visibleRoadWidthAt(road, index))
      }
    ];
    if (!road.oneway) directions.push({
      name: 'backward',
      count: road.lanesBackward ?? Math.max(1, Math.floor(road.lanes / 2)),
      points: [...road.points].reverse(),
      widths: road.points.map((_, index) => visibleRoadWidthAt(road, index)).reverse()
    });
    for (const direction of directions) for (let laneIndex = 0; laneIndex < direction.count; laneIndex += 1) {
      const laneWidth = Math.min(4.2, Math.max(2.7, road.width / Math.max(1, road.lanes)));
      // The OSM polyline is the centre of the whole carriageway. Offsetting by
      // the number of lanes in one direction placed the first lane of a
      // one-way avenue beyond the road edge (8.4 m on a 10 m, three-lane road).
      // Share the lane-centre rule used by vehicle physics so every graph lane
      // remains inside the rendered asphalt.
      const points = direction.points.map((point, index, all) => {
        const from = all[Math.max(0, index - 1)];
        const to = all[Math.min(all.length - 1, index + 1)];
        const width = direction.widths[index];
        const offset = width / 2 - width / Math.max(1, road.lanes) * (laneIndex + 0.5);
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
  const roadById = new Map(roads.map((road) => [road.id, road]));
  const lanesByRoad = groupBy(lanes, (lane) => lane.roadSegmentId);
  for (const lane of lanes) {
    lane.neighborLaneIds = (lanesByRoad.get(lane.roadSegmentId) ?? [])
      .filter((candidate) => candidate.roadSegmentId === lane.roadSegmentId && candidate.direction === lane.direction && candidate.id !== lane.id)
      .map((candidate) => candidate.id);
  }
  for (const [sourceNodeId, incoming] of arrivals) {
    const outgoing = departures.get(sourceNodeId) ?? [];
    for (const arrival of incoming) {
      const hasAlternativeRoad = outgoing.some((departure) =>
        departure.lane.layer === arrival.lane.layer
        && departure.lane.roadSegmentId !== arrival.lane.roadSegmentId
      );
      const legal = outgoing.filter((departure) => {
        if (departure.lane.id === arrival.lane.id) return false;
        if (departure.lane.layer !== arrival.lane.layer) return false;
        if (departure.lane.roadSegmentId === arrival.lane.roadSegmentId && departure.lane.direction !== arrival.lane.direction) {
          // At a real dead end, connect the two directions so the street can
          // join the global component without inventing a shortcut over grass.
          // Intersections keep using their outgoing roads and do not gain a
          // free U-turn across traffic.
          const actualRoadEnd = arrival.nodeId === arrival.lane.endNodeId
            && departure.nodeId === departure.lane.startNodeId;
          return actualRoadEnd && !hasAlternativeRoad;
        }
        return Math.abs(angleDelta(arrival.heading, departure.heading)) < MAX_JUNCTION_TURN_RADIANS;
      });
      const byRoad = groupBy(legal, (departure) => departure.lane.roadSegmentId);
      for (const candidates of byRoad.values()) {
        const departure = candidates[Math.min(arrival.lane.index, candidates.length - 1)];
        const toLane = departure.lane;
        const fromNode = graphNodes.get(arrival.nodeId)!;
        const target = graphNodes.get(departure.nodeId)!;
        fromNode.edges.push({
          to: target.id, distance: junctionConnectorCost(fromNode, target, arrival.heading, departure.heading),
          roadId: toLane.roadSegmentId, laneId: toLane.id,
          highway: roadById.get(toLane.roadSegmentId)?.highway, connector: true
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
  // Rebuild the junction connector for the hierarchy explicitly between
  // index-zero lanes. A connector selected for lane 1/2 is intentionally
  // discarded above; without this pass that could split an otherwise
  // continuous OSM corridor into regional graph islands.
  for (const [sourceNodeId, incoming] of arrivals) {
    const routingIncoming = incoming.filter((arrival) => arrival.lane.index === 0);
    const routingOutgoing = (departures.get(sourceNodeId) ?? []).filter((departure) => departure.lane.index === 0);
    for (const arrival of routingIncoming) {
      const hasAlternativeRoad = routingOutgoing.some((departure) =>
        departure.lane.layer === arrival.lane.layer
        && departure.lane.roadSegmentId !== arrival.lane.roadSegmentId
      );
      const legal = routingOutgoing.filter((departure) => {
        if (departure.lane.id === arrival.lane.id || departure.lane.layer !== arrival.lane.layer) return false;
        if (departure.lane.roadSegmentId === arrival.lane.roadSegmentId && departure.lane.direction !== arrival.lane.direction) {
          const actualRoadEnd = arrival.nodeId === arrival.lane.endNodeId
            && departure.nodeId === departure.lane.startNodeId;
          return actualRoadEnd && !hasAlternativeRoad;
        }
        return Math.abs(angleDelta(arrival.heading, departure.heading)) < MAX_JUNCTION_TURN_RADIANS;
      });
      for (const candidates of groupBy(legal, (departure) => departure.lane.roadSegmentId).values()) {
        const departure = candidates[0];
        const fromNode = graphNodes.get(arrival.nodeId)!;
        const target = graphNodes.get(departure.nodeId)!;
        if (fromNode.edges.some((edge) => edge.to === target.id)) continue;
        fromNode.edges.push({
          to: target.id, distance: junctionConnectorCost(fromNode, target, arrival.heading, departure.heading),
          roadId: departure.lane.roadSegmentId, laneId: departure.lane.id,
          highway: roadById.get(departure.lane.roadSegmentId)?.highway, connector: true
        });
      }
    }
  }
  // Some OSM junctions join one-way fragments with only arrivals (or only
  // departures). They are physically the same node, but cannot be recovered
  // by the movement pass above. Join different real ways at that exact node
  // on the same layer so regional routing remains continuous.
  const routingBySource = groupBy(routingNodes, (node) => node.sourceNodeId ?? node.id);
  for (const colocated of routingBySource.values()) {
    if (colocated.length < 2 || colocated.length > 24) continue;
    for (const fromNode of colocated) for (const target of colocated) {
      if (fromNode.id === target.id || fromNode.roadSegmentId === target.roadSegmentId) continue;
      const fromLane = fromNode.laneId ? laneById.get(fromNode.laneId) : undefined;
      const toLane = target.laneId ? laneById.get(target.laneId) : undefined;
      const fromRoad = fromLane ? roadById.get(fromLane.roadSegmentId) : undefined;
      const toRoad = toLane ? roadById.get(toLane.roadSegmentId) : undefined;
      if (!fromLane || !toLane || !fromRoad || !toRoad) continue;
      if (!sameLevelOrStructureEndpoint(fromRoad, toRoad, fromNode.sourceNodeId)) continue;
      const arrivalHeading = laneNodeHeading(fromLane, fromNode.id, 'arrival');
      const departureHeading = laneNodeHeading(toLane, target.id, 'departure');
      if (arrivalHeading === undefined || departureHeading === undefined
        || Math.abs(angleDelta(arrivalHeading, departureHeading)) >= MAX_JUNCTION_TURN_RADIANS) continue;
      if (fromNode.edges.some((edge) => edge.to === target.id)) continue;
      fromNode.edges.push({
        to: target.id, distance: junctionConnectorCost(fromNode, target, arrivalHeading, departureHeading),
        roadId: toLane.roadSegmentId, laneId: toLane.id,
        highway: toRoad.highway, connector: true
      });
    }
  }
  // Keep every real routing component. Regional service roads and gated lots
  // can be small components, but removing them also removed their geometry
  // from GPS lookup and made the closest lane several kilometres away.
  return { lanes, graph: compactRoutingGraph(routingNodes, lanes, roadById) };
}

const MAX_JUNCTION_TURN_RADIANS = Math.PI * 0.76;

function junctionConnectorCost(from: Point, to: Point, arrivalHeading: number, departureHeading: number) {
  const turn = Math.abs(angleDelta(arrivalHeading, departureHeading));
  // Junction endpoints often share almost the same coordinate. Charging only
  // their geometric length made a 130Â° hook virtually free and preferable to
  // a normal entrance a few metres ahead. A modest angular cost preserves
  // legal turns while favouring straight and 90Â° connections.
  return Math.max(0.5, distance(from, to)) + turn * turn * 2;
}

function laneNodeHeading(lane: LaneData, nodeId: string, kind: 'arrival' | 'departure') {
  const separator = nodeId.lastIndexOf(':');
  const index = Number(nodeId.slice(separator + 1));
  if (!Number.isInteger(index)) return undefined;
  if (kind === 'arrival') {
    if (index <= 0 || index >= lane.points.length) return undefined;
    return Math.atan2(lane.points[index].y - lane.points[index - 1].y, lane.points[index].x - lane.points[index - 1].x);
  }
  if (index < 0 || index >= lane.points.length - 1) return undefined;
  return Math.atan2(lane.points[index + 1].y - lane.points[index].y, lane.points[index + 1].x - lane.points[index].x);
}

function normalizeConnectedCorridors(roads: RoadDraft[], options: RoadNormalizationOptions) {
  const endpoints = new Map<string, RoadDraft[]>();
  for (const road of roads) for (const point of [road.points[0], road.points.at(-1)!]) {
    addGrouped(endpoints, `${road.corridorId}|${point.nodeId}`, road);
  }

  // OSM frequently splits a road for a crossing or a turn lane and puts a
  // different explicit lane count on only that tiny fragment. Continuity on
  // both sides is stronger evidence than the isolated tag.
  for (let pass = 0; pass < 3; pass += 1) for (const road of roads) {
    if (!canNormalizeNoise(road) || roadLength(road) > options.shortOscillationMeters) continue;
    const neighbors = continuationNeighbors(road, endpoints);
    if (neighbors.length !== 2) continue;
    const [before, after] = neighbors;
    if (before.oneway !== road.oneway || after.oneway !== road.oneway) continue;
    if (before.lanes === after.lanes && road.lanes !== before.lanes) {
      road.lanes = before.lanes;
      road.lanesForward = before.lanesForward;
      road.lanesBackward = before.lanesBackward;
      road.width = realisticRoadWidth((before.width + after.width) / 2, road.lanes, 0, options);
    } else if (road.lanes === before.lanes && before.lanes === after.lanes) {
      const stableWidth = (before.width + after.width) / 2;
      if (Math.abs(before.width - after.width) <= Math.max(0.8, stableWidth * 0.1)
        && Math.abs(road.width - stableWidth) > Math.max(0.8, stableWidth * 0.12)) {
        road.width = stableWidth;
      }
    }
  }

  buildCorridorWidthProfiles(roads, options);
  buildJunctionTransitionProfiles(roads, options);
}

function canNormalizeNoise(road: RoadDraft) {
  return !road._locked
    && !road.highway.endsWith('_link')
    && road.junction !== 'roundabout';
}

function continuationNeighbors(road: RoadDraft, endpoints: Map<string, RoadDraft[]>) {
  const values: RoadDraft[] = [];
  for (const point of [road.points[0], road.points.at(-1)!]) {
    const candidates = (endpoints.get(`${road.corridorId}|${point.nodeId}`) ?? []).filter((value) => value.id !== road.id);
    if (candidates.length === 1) values.push(candidates[0]);
  }
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

type TaperTarget = { width: number; distanceMeters: number };

function buildCorridorWidthProfiles(roads: RoadDraft[], options: RoadNormalizationOptions) {
  const eligible = roads.filter((road) => !road.highway.endsWith('_link') && road.junction !== 'roundabout');
  const endpointRoads = new Map<string, RoadDraft[]>();
  const keysByRoad = new Map<string, [string, string]>();
  for (const road of eligible) {
    const prefix = `${road.corridorId ?? road.id}|${road.oneway ? 'oneway' : 'twoway'}|${road.layer ?? 0}`;
    const keys: [string, string] = [`${prefix}|${road.points[0].nodeId}`, `${prefix}|${road.points.at(-1)!.nodeId}`];
    keysByRoad.set(road.id, keys);
    for (const key of keys) addGrouped(endpointRoads, key, road);
  }

  const endpointWidths = new Map<string, number>();
  const endpointMinimumWidths = new Map<string, number>();
  const endpointMaximumWidths = new Map<string, number>();
  for (const [key, connected] of endpointRoads) {
    let weightedWidth = 0;
    let totalWeight = 0;
    for (const road of connected) {
      const weight = Math.max(20, Math.min(300, roadLength(road)));
      weightedWidth += road.width * weight;
      totalWeight += weight;
    }
    const minimumWidth = Math.max(...connected.map((road) => road.lanes * options.minimumLaneWidthMeters));
    const maximumWidth = Math.min(...connected.map((road) => road.lanes * options.maximumLaneWidthMeters));
    const weightedAverage = weightedWidth / Math.max(1, totalWeight);
    endpointMinimumWidths.set(key, minimumWidth);
    endpointMaximumWidths.set(key, maximumWidth);
    endpointWidths.set(key, maximumWidth >= minimumWidth
      ? Math.max(minimumWidth, Math.min(maximumWidth, weightedAverage))
      : weightedAverage);
  }

  // Project the shared endpoint widths onto a Lipschitz constraint. This
  // distributes a large lane-count change over all short OSM fragments in the
  // corridor instead of forcing the whole taper into a single tiny segment.
  for (let pass = 0; pass < 160; pass += 1) {
    let maximumExcess = 0;
    for (const road of eligible) {
      const keys = keysByRoad.get(road.id)!;
      if (keys[0] === keys[1]) continue;
      const start = endpointWidths.get(keys[0]) ?? road.width;
      const end = endpointWidths.get(keys[1]) ?? road.width;
      const limit = options.maximumWidthGradientPerMeter * roadLength(road);
      const excess = Math.abs(end - start) - limit;
      if (excess <= 0) continue;
      maximumExcess = Math.max(maximumExcess, excess);
      const direction = Math.sign(end - start);
      endpointWidths.set(keys[0], clampSharedEndpointWidth(
        start + direction * excess / 2,
        endpointMinimumWidths.get(keys[0]) ?? 0,
        endpointMaximumWidths.get(keys[0]) ?? Number.POSITIVE_INFINITY
      ));
      endpointWidths.set(keys[1], clampSharedEndpointWidth(
        end - direction * excess / 2,
        endpointMinimumWidths.get(keys[1]) ?? 0,
        endpointMaximumWidths.get(keys[1]) ?? Number.POSITIVE_INFINITY
      ));
    }
    if (maximumExcess < 0.001) break;
  }

  for (const road of eligible) {
    const total = roadLength(road);
    if (total <= 0.001) continue;
    const keys = keysByRoad.get(road.id)!;
    const startWidth = endpointWidths.get(keys[0]) ?? road.width;
    const endWidth = endpointWidths.get(keys[1]) ?? road.width;
    if (Math.abs(startWidth - road.width) < 0.01 && Math.abs(endWidth - road.width) < 0.01) continue;
    applyWidthProfile(road, {
      start: {
        width: startWidth,
        distanceMeters: Math.min(total, Math.max(options.transitionMeters, Math.abs(startWidth - road.width) / options.maximumWidthGradientPerMeter))
      },
      end: {
        width: endWidth,
        distanceMeters: Math.min(total, Math.max(options.transitionMeters, Math.abs(endWidth - road.width) / options.maximumWidthGradientPerMeter))
      }
    }, options.minimumLaneWidthMeters, options.maximumLaneWidthMeters, options.maximumWidthGradientPerMeter);
  }
}

function clampSharedEndpointWidth(value: number, minimum: number, maximum: number) {
  return maximum >= minimum ? Math.max(minimum, Math.min(maximum, value)) : value;
}

type RoadPointOccurrence = { road: RoadDraft; pointIndex: number };

function buildJunctionTransitionProfiles(roads: RoadDraft[], options: RoadNormalizationOptions) {
  const occurrences = new Map<string, RoadPointOccurrence[]>();
  for (const road of roads) road.points.forEach((point, pointIndex) => {
    addGrouped(occurrences, point.nodeId, { road, pointIndex });
  });

  const taperByRoad = new Map<string, { start?: TaperTarget; end?: TaperTarget }>();
  for (const road of roads) {
    if (road.highway.endsWith('_link') || road.junction === 'roundabout') continue;
    const endpoints = [0, road.points.length - 1];
    for (const pointIndex of endpoints) {
      const nodeId = road.points[pointIndex].nodeId;
      const candidates = uniqueRoadOccurrences((occurrences.get(nodeId) ?? []).filter((candidate) =>
        candidate.road.id !== road.id
        && sameLevelOrStructureEndpoint(road, candidate.road, nodeId)
      ));
      // A continuidade da própria avenida já recebe um perfil compartilhado
      // acima. Aplicar outro afunilamento neste mesmo ponto criava uma emenda
      // diferente entre dois fragmentos que deveriam formar uma via só.
      if (candidates.some((candidate) => isSameCorridorContinuation(road, candidate.road))) continue;
      const continuation = selectVisualContinuation(road, pointIndex, candidates);
      if (!continuation) continue;
      const ownWidth = visibleRoadWidthAt(road, pointIndex);
      const continuationWidth = visibleRoadWidthAt(continuation.road, continuation.pointIndex);
      // The wider carriageway drops lanes before the junction. This is both
      // more legible and more physical than inflating a tiny link/roundabout
      // fragment until it looks like an avenue.
      if (ownWidth <= continuationWidth + 0.35) continue;
      const total = roadLength(road);
      const minimumWidth = road.lanes * options.minimumTaperLaneWidthMeters;
      const maximumWidth = road.lanes * options.maximumLaneWidthMeters;
      const widthDrop = Math.min(
        ownWidth - Math.max(minimumWidth, continuationWidth),
        options.maximumWidthGradientPerMeter * total
      );
      if (widthDrop <= 0.01) continue;
      const oppositeWidth = visibleRoadWidthAt(road, pointIndex === 0 ? road.points.length - 1 : 0);
      const desiredWidth = ownWidth - widthDrop;
      const target = {
        width: Math.max(
          minimumWidth,
          Math.min(
            maximumWidth,
            oppositeWidth + options.maximumWidthGradientPerMeter * total,
            Math.max(oppositeWidth - options.maximumWidthGradientPerMeter * total, desiredWidth)
          )
        ),
        distanceMeters: Math.min(total, Math.max(
          options.transitionMeters,
          widthDrop / options.maximumWidthGradientPerMeter
        ))
      };
      const taper = taperByRoad.get(road.id) ?? {};
      if (pointIndex === 0) taper.start = target; else taper.end = target;
      taperByRoad.set(road.id, taper);
    }
  }

  for (const road of roads) {
    const taper = taperByRoad.get(road.id);
    if (!taper) continue;
    if (taper.start && taper.end) {
      const maximumDifference = options.maximumWidthGradientPerMeter * roadLength(road);
      if (Math.abs(taper.end.width - taper.start.width) > maximumDifference) {
        if (taper.start.width < taper.end.width) taper.start.width = taper.end.width - maximumDifference;
        else taper.end.width = taper.start.width - maximumDifference;
      }
    }
    applyWidthProfile(
      road,
      taper,
      options.minimumTaperLaneWidthMeters,
      options.maximumLaneWidthMeters,
      options.maximumWidthGradientPerMeter
    );
  }
}

function isSameCorridorContinuation(from: RoadDraft, to: RoadDraft) {
  return from.corridorId === to.corridorId
    && from.oneway === to.oneway
    && from.layer === to.layer
    && !to.highway.endsWith('_link')
    && to.junction !== 'roundabout';
}

function uniqueRoadOccurrences(values: RoadPointOccurrence[]) {
  const unique = new Map<string, RoadPointOccurrence>();
  for (const value of values) {
    const current = unique.get(value.road.id);
    if (!current || endpointDistance(value) < endpointDistance(current)) unique.set(value.road.id, value);
  }
  return [...unique.values()];
}

function endpointDistance(value: RoadPointOccurrence) {
  return Math.min(value.pointIndex, value.road.points.length - 1 - value.pointIndex);
}

function selectVisualContinuation(road: RoadDraft, pointIndex: number, candidates: RoadPointOccurrence[]) {
  if (candidates.length === 1) return candidates[0];
  const ranked = candidates.map((candidate) => ({
    candidate,
    score: continuationAlignment(road, pointIndex, candidate.road, candidate.pointIndex)
  })).sort((a, b) => b.score - a.score);
  // At a real crossing, only the nearly straight continuation inherits the
  // larger mouth. Perpendicular side streets keep their own width.
  return ranked[0]?.score >= Math.cos(Math.PI / 5) ? ranked[0].candidate : undefined;
}

function continuationAlignment(fromRoad: RoadDraft, fromIndex: number, toRoad: RoadDraft, toIndex: number) {
  const fromDirections = directionsAwayFromPoint(fromRoad.points, fromIndex);
  const toDirections = directionsAwayFromPoint(toRoad.points, toIndex);
  let best = -1;
  for (const from of fromDirections) for (const to of toDirections) {
    best = Math.max(best, -(from.x * to.x + from.y * to.y));
  }
  return best;
}

function directionsAwayFromPoint(points: RoadPoint[], index: number) {
  const origin = points[index];
  return [index > 0 ? points[index - 1] : undefined, index < points.length - 1 ? points[index + 1] : undefined]
    .flatMap((neighbor) => {
      if (!neighbor) return [];
      const dx = neighbor.x - origin.x;
      const dy = neighbor.y - origin.y;
      const length = Math.hypot(dx, dy);
      return length > 0.001 ? [{ x: dx / length, y: dy / length }] : [];
    });
}

function applyWidthProfile(
  road: RoadDraft,
  taper: { start?: TaperTarget; end?: TaperTarget },
  minimumLaneWidthMeters: number,
  maximumLaneWidthMeters: number,
  maximumWidthGradientPerMeter: number
) {
  const total = roadLength(road);
  const originalDistances = cumulativeDistances(road.points);
  const originalWidths = road.points.map((_, index) => road.widthProfile?.[index] ?? road.width);
  const insertionDistances = [
    taper.start !== undefined && total > taper.start.distanceMeters ? taper.start.distanceMeters : null,
    taper.end !== undefined && total > taper.end.distanceMeters ? total - taper.end.distanceMeters : null
  ].filter((value): value is number => value !== null && value > 0 && value < total);
  road.points = insertPointsAtDistances(road, insertionDistances);
  const distances = cumulativeDistances(road.points);
  const widths = distances.map((fromStart) => {
    const fromEnd = total - fromStart;
    const startWeight = taper.start ? Math.max(0, 1 - fromStart / taper.start.distanceMeters) : 0;
    const endWeight = taper.end ? Math.max(0, 1 - fromEnd / taper.end.distanceMeters) : 0;
    const totalWeight = startWeight + endWeight;
    const normalizedStart = totalWeight > 1 ? startWeight / totalWeight : startWeight;
    const normalizedEnd = totalWeight > 1 ? endWeight / totalWeight : endWeight;
    const nominalWeight = Math.max(0, 1 - normalizedStart - normalizedEnd);
    const nominalWidth = interpolateProfile(originalDistances, originalWidths, fromStart);
    const width = nominalWeight * nominalWidth
      + normalizedStart * (taper.start?.width ?? road.width)
      + normalizedEnd * (taper.end?.width ?? road.width);
    // A transição visual pode manter a seção de menos faixas larga por alguns
    // metros, mas nunca pode comprimir as faixas existentes abaixo do mínimo
    // funcional de um veículo.
    return Math.max(
      road.lanes * minimumLaneWidthMeters,
      Math.min(road.lanes * maximumLaneWidthMeters, width)
    );
  });
  road.widthProfile = stabilizeWidthProfile(
    road.points,
    widths,
    maximumWidthGradientPerMeter,
    true,
    true
  ).map((width) => Math.round(width * 1_000) / 1_000);
}

function stabilizeWidthProfile(
  points: RoadPoint[],
  preferredWidths: number[],
  maximumGradientPerMeter: number,
  pinStart: boolean,
  pinEnd: boolean
) {
  const widths = [...preferredWidths];
  if (widths.length < 2) return widths;
  const maximumPasses = Math.max(4, widths.length * 2);
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    let changed = false;
    for (let index = 1; index < widths.length; index += 1) {
      if (pinEnd && index === widths.length - 1) continue;
      const limit = maximumGradientPerMeter * distance(points[index - 1], points[index]);
      const next = Math.max(widths[index - 1] - limit, Math.min(widths[index - 1] + limit, widths[index]));
      changed ||= Math.abs(next - widths[index]) > 0.0001;
      widths[index] = next;
    }
    for (let index = widths.length - 2; index >= 0; index -= 1) {
      if (pinStart && index === 0) continue;
      const limit = maximumGradientPerMeter * distance(points[index], points[index + 1]);
      const next = Math.max(widths[index + 1] - limit, Math.min(widths[index + 1] + limit, widths[index]));
      changed ||= Math.abs(next - widths[index]) > 0.0001;
      widths[index] = next;
    }
    if (!changed) break;
  }
  return widths;
}

function interpolateProfile(distances: number[], widths: number[], target: number) {
  const upper = distances.findIndex((distance) => distance >= target);
  if (upper <= 0) return widths[0];
  if (upper < 0) return widths.at(-1)!;
  const lower = upper - 1;
  const span = distances[upper] - distances[lower];
  const progress = span > 0 ? (target - distances[lower]) / span : 0;
  return widths[lower] + (widths[upper] - widths[lower]) * progress;
}

function insertPointsAtDistances(road: RoadDraft, requested: number[]) {
  if (!requested.length) return road.points;
  const originalDistances = cumulativeDistances(road.points);
  const allDistances = [...new Set([...originalDistances, ...requested.map((value) => Math.round(value * 1_000) / 1_000)])].sort((a, b) => a - b);
  return allDistances.map((target) => {
    const exact = originalDistances.findIndex((value) => Math.abs(value - target) < 0.001);
    if (exact >= 0) return road.points[exact];
    let upper = originalDistances.findIndex((value) => value > target);
    if (upper < 1) upper = 1;
    const lower = upper - 1;
    const span = originalDistances[upper] - originalDistances[lower];
    const progress = span > 0 ? (target - originalDistances[lower]) / span : 0;
    const from = road.points[lower];
    const to = road.points[upper];
    return {
      nodeId: `taper:${road.id}:${Math.round(target * 10)}`,
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      lat: from.lat + (to.lat - from.lat) * progress,
      lon: from.lon + (to.lon - from.lon) * progress
    };
  });
}

function cumulativeDistances(points: Array<{ x: number; y: number }>) {
  const values = [0];
  for (let index = 1; index < points.length; index += 1) {
    values.push(values[index - 1] + distance(points[index - 1], points[index]));
  }
  return values;
}

function realisticRoadWidth(
  taggedWidth: number | undefined,
  lanes: number,
  shoulderWidth: number,
  options: RoadNormalizationOptions
) {
  const inferred = lanes * options.laneWidthMeters + shoulderWidth;
  if (taggedWidth === undefined) return inferred;
  return Math.max(
    lanes * options.minimumLaneWidthMeters,
    Math.min(lanes * options.maximumLaneWidthMeters + shoulderWidth, taggedWidth)
  );
}

function compactRoutingGraph(
  routingNodes: NavigationGraph['nodes'],
  lanes: LaneData[],
  roadById: Map<string, RoadData>
): NavigationGraph {
  const oldById = new Map(routingNodes.map((node) => [node.id, node]));

  const keptLaneNodes = new Map<string, number[]>();
  for (const lane of lanes) {
    if (lane.index !== 0) continue;
    // O formato numérico empacotado já fornece a redução decisiva de bytes.
    // Preservar cada vértice da linha evita que uma corda reta entre pontos
    // distantes corte a margem interna de curvas suaves.
    keptLaneNodes.set(lane.id, lane.points.map((_, index) => index));
  }

  const selectedOldIds: string[] = [];
  for (const lane of lanes) for (const index of keptLaneNodes.get(lane.id) ?? []) {
    const id = `${lane.id}:${index}`;
    if (oldById.has(id)) selectedOldIds.push(id);
  }
  const uniqueOldIds = [...new Set(selectedOldIds)];
  const compactId = new Map(uniqueOldIds.map((id, index) => [id, index.toString(36)]));
  const nodes: NavigationGraph['nodes'] = uniqueOldIds.map((oldId) => {
    const old = oldById.get(oldId)!;
    return {
      id: compactId.get(oldId)!,
      x: old.x,
      y: old.y,
      edges: [],
      sourceNodeId: old.sourceNodeId,
      roadSegmentId: old.roadSegmentId
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const lane of lanes) {
    const kept = keptLaneNodes.get(lane.id);
    if (!kept) continue;
    const road = roadById.get(lane.roadSegmentId);
    for (let cursor = 0; cursor < kept.length - 1; cursor += 1) {
      const fromIndex = kept[cursor];
      const toIndex = kept[cursor + 1];
      const fromId = compactId.get(`${lane.id}:${fromIndex}`);
      const toId = compactId.get(`${lane.id}:${toIndex}`);
      if (!fromId || !toId) continue;
      let edgeDistance = 0;
      for (let index = fromIndex + 1; index <= toIndex; index += 1) edgeDistance += distance(lane.points[index - 1], lane.points[index]);
      nodeById.get(fromId)!.edges.push({
        to: toId,
        distance: edgeDistance,
        roadId: lane.roadSegmentId,
        highway: road?.highway
      });
    }
  }
  for (const oldId of uniqueOldIds) {
    const fromId = compactId.get(oldId)!;
    for (const edge of oldById.get(oldId)!.edges) {
      if (!edge.connector) continue;
      const toId = compactId.get(edge.to);
      if (!toId || nodeById.get(fromId)!.edges.some((candidate) => candidate.to === toId)) continue;
      nodeById.get(fromId)!.edges.push({ ...edge, to: toId, laneId: undefined });
    }
  }
  return { kind: 'lane', version: '0.8.6', nodes };
}

export function packNavigationGraph(graph: NavigationGraph): PackedNavigationGraph {
  const precision = 10;
  const nodeIndexes = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const roads = [...new Set(graph.nodes.flatMap((node) => [
    ...(node.roadSegmentId ? [node.roadSegmentId] : []),
    ...node.edges.map((edge) => edge.roadId)
  ]))];
  const highways = [...new Set(graph.nodes.flatMap((node) => node.edges.flatMap((edge) => edge.highway ? [edge.highway] : [])))];
  const roadIndexes = new Map(roads.map((id, index) => [id, index]));
  const highwayIndexes = new Map(highways.map((id, index) => [id, index]));
  return {
    kind: 'packed-lane',
    version: graph.version ?? '0.8.6',
    precision,
    roads,
    highways,
    nodes: graph.nodes.map((node) => [
      Math.round(node.x * precision),
      Math.round(node.y * precision),
      node.edges.flatMap((edge): Array<[number, number, number, number, 0 | 1]> => {
        const to = nodeIndexes.get(edge.to);
        if (to === undefined) return [];
        return [[
          to,
          Math.round(edge.distance * precision),
          roadIndexes.get(edge.roadId) ?? -1,
          edge.highway ? highwayIndexes.get(edge.highway) ?? -1 : -1,
          edge.connector ? 1 : 0
        ]];
      })
    ])
  };
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

function sameLevelOrStructureEndpoint(from: RoadData, to: RoadData, sourceNodeId?: string) {
  if (from.layer === to.layer) return true;
  if (!sourceNodeId) return false;
  return [from, to].some((road) => (road.bridge || road.tunnel)
    && (road.points[0]?.nodeId === sourceNodeId || road.points.at(-1)?.nodeId === sourceNodeId));
}
