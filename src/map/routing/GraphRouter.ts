import type { GraphEdge, GraphNode, NavigationGraph, Point, RoadData } from '../../types/game';
import { isDrivableRoad, pointInTrafficLane, visibleRoadWidthAt } from './roadRules';

type DirectedSegment = {
  from: GraphNode;
  to: GraphNode;
  edge: GraphEdge;
  length: number;
  heading: number;
};

type LaneAnchor = DirectedSegment & {
  point: Point;
  t: number;
  lateralDistance: number;
  headingError: number;
  forwardOffset: number;
  score: number;
};

type SurfaceSegment = { from: Point; to: Point; halfWidthStart: number; halfWidthEnd: number };

export class GraphRouter {
  private readonly graph: NavigationGraph;
  private readonly nodes = new Map<string, GraphNode>();
  private readonly roads = new Map<string, RoadData>();
  private readonly spatialNodes = new Map<string, GraphNode[]>();
  private readonly spatialSegments = new Map<string, DirectedSegment[]>();
  private readonly surfaceCells = new Map<string, SurfaceSegment[]>();
  private readonly incomingCount = new Map<string, number>();
  private readonly incomingNodes = new Map<string, string[]>();
  private readonly spatialCellSize = 120;
  private readonly laneGraph: boolean;
  private readonly localGraph: boolean;

  constructor(graph: NavigationGraph, roads: RoadData[] = [], private readonly roadNames: Record<string, string> = {}) {
    this.graph = graph;
    this.laneGraph = graph.kind === 'lane';
    this.localGraph = graph.version?.endsWith('-local') ?? false;
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
      const key = this.spatialKey(node);
      const cell = this.spatialNodes.get(key) ?? [];
      cell.push(node);
      this.spatialNodes.set(key, cell);
    }
    for (const node of graph.nodes) for (const edge of node.edges) {
      this.incomingCount.set(edge.to, (this.incomingCount.get(edge.to) ?? 0) + 1);
      const incoming = this.incomingNodes.get(edge.to) ?? [];
      incoming.push(node.id);
      this.incomingNodes.set(edge.to, incoming);
      const target = this.nodes.get(edge.to);
      if (this.laneGraph && target) this.indexSegment(node, target, edge);
    }
    for (const road of roads) {
      this.roads.set(road.id, road);
      this.indexRoadSurface(road);
    }
  }

  matchesGraph(graph: NavigationGraph) {
    return this.graph === graph;
  }

  /** The navigation graph is immutable and expensive to index. Streaming only
   * changes the nearby road surfaces, so keep the global node/edge indexes and
   * refresh this much smaller surface lookup in place. */
  replaceRoads(roads: RoadData[]) {
    this.roads.clear();
    this.surfaceCells.clear();
    for (const road of roads) {
      this.roads.set(road.id, road);
      this.indexRoadSurface(road);
    }
  }

  nearest(point: Point): GraphNode {
    let best: GraphNode | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    const nearby = this.nearbyNodes(point, 4);
    for (const node of nearby.length ? nearby : this.nodes.values()) {
      const distance = (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    if (!best) throw new Error('O grafo de navegação está vazio.');
    return best;
  }

  route(from: Point, to: Point): Point[] {
    const nodes = this.findRoute(from, to, undefined, false);
    return nodes ? routeGeometry(nodes) : [];
  }

  drivingRoute(from: Point, to: Point, preferredStartHeading?: number): Point[] {
    if (this.laneGraph) return this.laneDrivingRoute(from, to, preferredStartHeading);
    const nodes = this.findRoute(from, to, preferredStartHeading, true);
    if (!nodes || nodes.length < 2 || !this.roads.size) return nodes?.map(({ x, y }) => ({ x, y })) ?? [];

    const segments = nodes.slice(1).map((node, index) => {
      const start = nodes[index];
      const roadId = start.edges.find((edge) => edge.to === node.id)?.roadId;
      const road = roadId ? this.roads.get(roadId) : undefined;
      return {
        start: pointInTrafficLane(start, start, node, road),
        end: pointInTrafficLane(node, start, node, road)
      };
    });

    const lanePoints = nodes.map((_, index) => {
      if (index === 0) return segments[0].start;
      if (index === nodes.length - 1) return segments[segments.length - 1].end;
      const incoming = segments[index - 1].end;
      const outgoing = segments[index].start;
      return { x: (incoming.x + outgoing.x) / 2, y: (incoming.y + outgoing.y) / 2 };
    });
    if (Math.hypot(from.x - lanePoints[0].x, from.y - lanePoints[0].y) > 1) lanePoints.unshift({ ...from });
    const last = lanePoints[lanePoints.length - 1];
    if (Math.hypot(to.x - last.x, to.y - last.y) > 1) lanePoints.push({ ...to });
    return lanePoints;
  }

  /** Returns a safe attachment to the navigable graph, or null when the
   * current road is isolated from it. */
  routeStart(point: Point, preferredHeading?: number): Point | null {
    if (!this.laneGraph) return { ...this.nearest(point) };
    const heading = Number.isFinite(preferredHeading) ? preferredHeading! : undefined;
    const anchor = this.laneAnchors(point, heading)
      .find((candidate) => this.safeStartConnection(point, candidate.point));
    return anchor ? { ...anchor.point } : null;
  }

  /** Finds the closest real lane in the published navigation network. Used
   * only to recover a save that is standing on an isolated imported road. */
  nearestRoutePoint(point: Point): Point {
    const anchor = this.laneGraph ? this.laneAnchors(point)[0] : undefined;
    return anchor ? { ...anchor.point } : { ...this.nearest(point) };
  }

  /**
   * Lane routes attach to the directed segment under the vehicle instead of
   * to an arbitrary nearby node. This prevents the first instruction from
   * jumping across a median, a sidewalk or a parallel access road.
   */
  private laneDrivingRoute(from: Point, to: Point, preferredStartHeading?: number): Point[] {
    const heading = Number.isFinite(preferredStartHeading) ? preferredStartHeading! : undefined;
    const starts = this.laneAnchors(from, heading);
    const goals = this.laneAnchors(to);
    if (!starts.length || !goals.length) {
      if (this.roads.size) return [];
      const fallback = this.findRoute(from, to, preferredStartHeading, true);
      return fallback?.map(({ x, y }) => ({ x, y })) ?? [];
    }

    const route = this.routeBetweenLaneAnchors(from, starts, goals);
    if (route) return route;
    // Region-level diagnostics do not have road surfaces available. Let them
    // try the nearby routable core when the closest fragment is a one-way
    // appendage. Runtime routing has surfaces and never makes this broad snap.
    if (!this.roads.size) {
      const broadRoute = this.routeBetweenLaneAnchors(
        from,
        this.laneAnchors(from, heading, true),
        this.laneAnchors(to, undefined, true)
      );
      if (broadRoute) return broadRoute;
    }
    return [];
  }

  private routeBetweenLaneAnchors(from: Point, starts: LaneAnchor[], goals: LaneAnchor[]) {
    for (const start of starts) {
      if (!this.safeStartConnection(from, start.point)) continue;
      const direct = goals.find((goal) => sameSegment(start, goal) && start.t <= goal.t + 0.001);
      if (direct) return compactRoute([from, start.point, direct.point]);

      const goalNodes = uniqueNodes(goals.map((goal) => goal.from));
      const route = this.findRouteToAny(start.to, goalNodes);
      if (!route) continue;
      const reached = route[route.length - 1];
      const goal = goals
        .filter((candidate) => candidate.from.id === reached.id)
        .sort((a, b) => a.score - b.score)[0];
      if (!goal) continue;
      return compactRoute([
        from,
        start.point,
        ...routeGeometry(route),
        goal.point
      ]);
    }
    return null;
  }

  private laneAnchors(point: Point, heading?: number, broad = false) {
    const segments = this.nearbySegments(point);
    if (!segments.length) return [];
    const anchors = segments.map((segment): LaneAnchor => {
      const projection = projectOnSegment(point, segment.from, segment.to);
      const lateralDistance = Math.hypot(point.x - projection.point.x, point.y - projection.point.y);
      const headingError = heading === undefined ? 0 : Math.abs(angleDelta(heading, segment.heading));
      const forwardOffset = heading === undefined
        ? 0
        : (projection.point.x - point.x) * Math.cos(heading) + (projection.point.y - point.y) * Math.sin(heading);
      const behindPenalty = forwardOffset < -0.35 ? 1_000 : 0;
      return {
        ...segment,
        point: projection.point,
        t: projection.t,
        lateralDistance,
        headingError,
        forwardOffset,
        score: lateralDistance * 20 + headingError * 42 + behindPenalty + (segment.edge.connector ? 3 : 0)
      };
    });
    const nearestDistance = Math.min(...anchors.map((anchor) => anchor.lateralDistance));
    const nearest = anchors.filter((anchor) =>
      anchor.lateralDistance <= nearestDistance + (broad ? 90 : 2.5)
    );
    const directionallyValid = heading === undefined
      ? nearest
      : nearest.filter((anchor) => anchor.headingError <= 1.25 && anchor.forwardOffset >= -0.35);
    return (directionallyValid.length ? directionallyValid : nearest)
      .sort((a, b) => a.score - b.score)
      .slice(0, broad ? 32 : 8);
  }

  private indexSegment(from: GraphNode, to: GraphNode, edge: GraphEdge) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 0.05) return;
    const segment: DirectedSegment = {
      from, to, edge, length,
      heading: Math.atan2(to.y - from.y, to.x - from.x)
    };
    const minX = Math.floor(Math.min(from.x, to.x) / this.spatialCellSize);
    const maxX = Math.floor(Math.max(from.x, to.x) / this.spatialCellSize);
    const minY = Math.floor(Math.min(from.y, to.y) / this.spatialCellSize);
    const maxY = Math.floor(Math.max(from.y, to.y) / this.spatialCellSize);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const key = `${x}:${y}`;
      const values = this.spatialSegments.get(key) ?? [];
      values.push(segment);
      this.spatialSegments.set(key, values);
    }
  }

  private indexRoadSurface(road: RoadData) {
    if (!isDrivableRoad(road)) return;
    for (let index = 1; index < road.points.length; index += 1) {
      const segment = {
        from: road.points[index - 1],
        to: road.points[index],
        halfWidthStart: visibleRoadWidthAt(road, index - 1) / 2,
        halfWidthEnd: visibleRoadWidthAt(road, index) / 2
      };
      const maximumHalfWidth = Math.max(segment.halfWidthStart, segment.halfWidthEnd);
      const minX = Math.floor((Math.min(segment.from.x, segment.to.x) - maximumHalfWidth) / this.spatialCellSize);
      const maxX = Math.floor((Math.max(segment.from.x, segment.to.x) + maximumHalfWidth) / this.spatialCellSize);
      const minY = Math.floor((Math.min(segment.from.y, segment.to.y) - maximumHalfWidth) / this.spatialCellSize);
      const maxY = Math.floor((Math.max(segment.from.y, segment.to.y) + maximumHalfWidth) / this.spatialCellSize);
      for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        const values = this.surfaceCells.get(key) ?? [];
        values.push(segment);
        this.surfaceCells.set(key, values);
      }
    }
  }

  private safeStartConnection(from: Point, to: Point) {
    if (!this.roads.size) return true;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length <= 0.5) return true;
    const steps = Math.max(1, Math.ceil(length));
    const insets: number[] = [];
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const point = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
      insets.push(this.roadInset(point));
    }
    if (insets.every((inset) => inset >= 0.91)) return true;
    // A short monotonic recovery from grass/sidewalk onto the nearest lane is
    // allowed. A connection that starts on asphalt, crosses a gap and reaches
    // another road is never allowed, even when the gap is shorter than 12 m.
    if (length > 12 || insets[0] >= 0.91) return false;
    let previous = insets[0];
    let reachedRoad = false;
    for (const inset of insets.slice(1)) {
      if (reachedRoad) {
        if (inset < 0.91) return false;
      } else if (inset >= 0.91) {
        reachedRoad = true;
      } else if (Number.isFinite(previous) && inset < previous - 0.2) {
        return false;
      }
      previous = inset;
    }
    return reachedRoad;
  }

  private roadInset(point: Point) {
    const cellX = Math.floor(point.x / this.spatialCellSize);
    const cellY = Math.floor(point.y / this.spatialCellSize);
    let inset = Number.NEGATIVE_INFINITY;
    for (const segment of this.surfaceCells.get(`${cellX}:${cellY}`) ?? []) {
      const projection = projectOnSegment(point, segment.from, segment.to);
      const halfWidth = segment.halfWidthStart + (segment.halfWidthEnd - segment.halfWidthStart) * projection.t;
      inset = Math.max(inset, halfWidth - Math.hypot(point.x - projection.point.x, point.y - projection.point.y));
    }
    return inset;
  }

  private nearbySegments(point: Point) {
    const centerX = Math.floor(point.x / this.spatialCellSize);
    const centerY = Math.floor(point.y / this.spatialCellSize);
    const found = new Map<string, DirectedSegment>();
    for (let ring = 0; ring <= 3; ring += 1) {
      for (let x = centerX - ring; x <= centerX + ring; x += 1) for (let y = centerY - ring; y <= centerY + ring; y += 1) {
        if (ring > 0 && x > centerX - ring && x < centerX + ring && y > centerY - ring && y < centerY + ring) continue;
        for (const segment of this.spatialSegments.get(`${x}:${y}`) ?? []) {
          found.set(`${segment.from.id}>${segment.to.id}`, segment);
        }
      }
      // Always inspect the adjacent cells too. Near a cell boundary, the
      // segment under the vehicle can live in the neighbouring bucket even
      // when the current (120 m wide) bucket already contains many roads.
      if (ring >= 1 && found.size >= 12) break;
    }
    return [...found.values()];
  }

  private findRoute(from: Point, to: Point, preferredStartHeading?: number, robust = true): GraphNode[] | null {
    if (!robust) return this.findRouteBetween(this.nearest(from), this.nearest(to));
    const goalCandidates = this.routeCandidates(to, false);
    if (!goalCandidates.length) return null;
    const starts = Number.isFinite(preferredStartHeading)
      ? this.directionalStartCandidates(from, preferredStartHeading!)
      : this.routeCandidates(from, true);
    for (const start of starts) {
      const route = this.findRouteToAny(start, goalCandidates);
      if (route) return route;
    }
    if (Number.isFinite(preferredStartHeading)) {
      const nearest = this.nearest(from);
      if (!starts.some((start) => start.id === nearest.id)) return this.findRouteToAny(nearest, goalCandidates);
    }
    return null;
  }

  private findRouteToAny(start: GraphNode, goals: GraphNode[]): GraphNode[] | null {
    const goalIds = new Set(goals.map((goal) => goal.id));
    const distances = new Map<string, number>([[start.id, 0]]);
    const previous = new Map<string, string>();
    const visited = new Set<string>();
    const pending = new MinHeap();
    pending.push({ id: start.id, distance: this.goalHeuristic(start, goals) });
    let reached: string | null = null;
    while (pending.size) {
      const entry = pending.pop()!;
      if (visited.has(entry.id)) continue;
      visited.add(entry.id);
      if (goalIds.has(entry.id)) { reached = entry.id; break; }
      const current = this.nodes.get(entry.id);
      if (!current) continue;
      const currentDistance = distances.get(entry.id) ?? Number.POSITIVE_INFINITY;
      for (const edge of current.edges) {
        if (visited.has(edge.to)) continue;
        const nextDistance = currentDistance + edge.distance;
        if (nextDistance >= (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, entry.id);
        const next = this.nodes.get(edge.to);
        pending.push({ id: edge.to, distance: nextDistance + (next ? this.goalHeuristic(next, goals) : 0) });
      }
    }
    if (!reached) return null;
    const ids = [reached];
    let cursor = reached;
    while (cursor !== start.id && previous.has(cursor)) {
      cursor = previous.get(cursor)!;
      ids.push(cursor);
    }
    if (cursor !== start.id) return null;
    return ids.reverse().map((id) => this.nodes.get(id)!);
  }

  private routeCandidates(point: Point, start: boolean) {
    const candidates = this.nearbyNodes(point, 4)
      .filter((node) => start ? node.edges.length > 0 : (this.incomingCount.get(node.id) ?? 0) > 0)
      .map((node) => ({ node, distance: Math.hypot(node.x - point.x, node.y - point.y) }))
      .sort((a, b) => a.distance - b.distance);
    const nearestDistance = candidates[0]?.distance ?? 0;
    const tolerance = nearestDistance < 2 ? 2 : 80;
    return candidates.filter((candidate) => candidate.distance <= nearestDistance + tolerance).slice(0, 12).map((candidate) => candidate.node);
  }

  private goalHeuristic(node: GraphNode, goals: GraphNode[]) {
    let best = Number.POSITIVE_INFINITY;
    for (const goal of goals) best = Math.min(best, Math.hypot(goal.x - node.x, goal.y - node.y));
    return best;
  }

  private findRouteBetween(start: GraphNode, goal: GraphNode): GraphNode[] | null {
    const distances = new Map<string, number>([[start.id, 0]]);
    const previous = new Map<string, string>();
    const visited = new Set<string>();
    const pending = new MinHeap();
    pending.push({ id: start.id, distance: 0 });

    while (pending.size) {
      const entry = pending.pop()!;
      if (visited.has(entry.id)) continue;
      visited.add(entry.id);
      if (entry.id === goal.id) break;
      const current = this.nodes.get(entry.id);
      if (!current) continue;
      for (const edge of current.edges) {
        if (visited.has(edge.to)) continue;
        const nextDistance = (distances.get(entry.id) ?? Number.POSITIVE_INFINITY) + edge.distance;
        if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
          distances.set(edge.to, nextDistance);
          previous.set(edge.to, entry.id);
          const next = this.nodes.get(edge.to);
          const heuristic = next ? Math.hypot(goal.x - next.x, goal.y - next.y) : 0;
          pending.push({ id: edge.to, distance: nextDistance + heuristic });
        }
      }
    }

    const ids = [goal.id];
    let cursor = goal.id;
    while (cursor !== start.id && previous.has(cursor)) {
      cursor = previous.get(cursor)!;
      ids.push(cursor);
    }
    if (cursor !== start.id) return null;
    return ids.reverse().map((id) => this.nodes.get(id)!);
  }

  /**
   * A position between graph nodes must join the route in the direction the
   * vehicle is already travelling. Picking the closest node alone can select
   * the node behind a car on a one-way road and request an illegal U-turn.
   */
  private directionalStartCandidates(point: Point, heading: number) {
    const nearby = this.nearbyNodes(point, 3)
      .map((node) => ({ node, distance: Math.hypot(node.x - point.x, node.y - point.y) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8);
    const nearestDistance = nearby[0]?.distance ?? 0;
    return nearby
      .filter(({ distance }) => distance <= nearestDistance + 45)
      .filter(({ node }) => node.edges.length > 0)
      .map(({ node, distance }) => {
        const approach = distance > 0.5 ? Math.atan2(node.y - point.y, node.x - point.x) : heading;
        const approachError = Math.abs(angleDelta(heading, approach));
        const behindPenalty = Math.cos(approach - heading) < -0.1 ? 90 : 0;
        const departureError = node.edges.reduce((best, edge) => {
          const next = this.nodes.get(edge.to);
          if (!next) return best;
          const departure = Math.atan2(next.y - node.y, next.x - node.x);
          return Math.min(best, Math.abs(angleDelta(heading, departure)));
        }, Math.PI);
        return {
          node,
          score: distance + behindPenalty + approachError * 12 + departureError * 8
        };
      })
      .sort((a, b) => a.score - b.score)
      .map(({ node }) => node);
  }

  private nearbyNodes(point: Point, maximumRing: number) {
    const centerX = Math.floor(point.x / this.spatialCellSize);
    const centerY = Math.floor(point.y / this.spatialCellSize);
    const found: GraphNode[] = [];
    for (let ring = 0; ring <= maximumRing; ring += 1) {
      for (let x = centerX - ring; x <= centerX + ring; x += 1) for (let y = centerY - ring; y <= centerY + ring; y += 1) {
        if (ring > 0 && x > centerX - ring && x < centerX + ring && y > centerY - ring && y < centerY + ring) continue;
        found.push(...(this.spatialNodes.get(`${x}:${y}`) ?? []));
      }
      if (found.length >= 24) break;
    }
    return found;
  }

  private spatialKey(point: Point) {
    return `${Math.floor(point.x / this.spatialCellSize)}:${Math.floor(point.y / this.spatialCellSize)}`;
  }

  distance(route: Point[]) {
    let total = 0;
    for (let index = 1; index < route.length; index += 1) {
      total += Math.hypot(route[index].x - route[index - 1].x, route[index].y - route[index - 1].y);
    }
    return total;
  }

  candidates(minDistanceFromCenter = 120): GraphNode[] {
    return [...this.nodes.values()]
      .filter((node) => node.edges.length >= 2 && Math.hypot(node.x, node.y) > minDistanceFromCenter)
      .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));
  }

  nearestRoadName(point: Point) {
    if (!this.laneGraph) return undefined;
    for (const anchor of this.laneAnchors(point, undefined, true)) {
      if (anchor.edge.connector) continue;
      const name = this.roadNames[anchor.edge.roadId] ?? this.roads.get(anchor.edge.roadId)?.name;
      if (name && !/^Via \d+$/.test(name)) return name;
    }
    return undefined;
  }

  addressAt(point: Point, regionName: string) {
    const roadName = this.nearestRoadName(point);
    if (roadName) {
      const includesRegion = roadName.toLocaleLowerCase('pt-BR').includes(regionName.toLocaleLowerCase('pt-BR'));
      return `${roadName}${includesRegion ? '' : `, ${regionName}`}, Brasília, DF`;
    }
    if (regionName === 'Setores Centrais') {
      const hemisphere = point.y < 0 ? 'Norte' : 'Sul';
      const side = point.x < 0 ? 'oeste' : 'leste';
      return `Setor Central ${hemisphere}, faixa ${side}, Brasília, DF`;
    }
    return `${regionName}, setor ${point.y < 0 ? 'norte' : 'sul'} ${point.x < 0 ? 'oeste' : 'leste'}, Brasília, DF`;
  }

  supportsRegionalRoutes() {
    return !this.localGraph;
  }

  /** Samples the spatial index instead of sorting or traversing every global
   * graph node. One routable point per occupied cell gives mission generation
   * broad geographic coverage without a main-thread walk over ~300k nodes. */
  distributedCandidates(limit = 900, minDistanceFromCenter = 80): GraphNode[] {
    const sampled: GraphNode[] = [];
    for (const cell of this.spatialNodes.values()) {
      const candidate = cell.find((node) =>
        node.edges.length >= 2
        && (this.incomingCount.get(node.id) ?? 0) > 0
        && Math.hypot(node.x, node.y) > minDistanceFromCenter
      );
      if (candidate) sampled.push(candidate);
    }
    if (sampled.length <= limit) return sampled;
    const result: GraphNode[] = [];
    const step = sampled.length / limit;
    for (let index = 0; index < limit; index += 1) result.push(sampled[Math.floor(index * step)]);
    return result;
  }

  /** Candidate destinations in the same returnable directed component as the
   * player. Local streamed graphs contain boundary stubs that are valid for
   * drawing but must not become pickup or drop-off points. */
  reachableCandidates(from: Point, minDistanceFromCenter = 120): GraphNode[] {
    const seed = this.nearest(from);
    const forward = this.traverse([seed.id], (id) => this.nodes.get(id)?.edges.map((edge) => edge.to) ?? []);
    const reverse = this.traverse([seed.id], (id) => this.incomingNodes.get(id) ?? []);
    const component = new Set([...forward].filter((id) => reverse.has(id)));
    return this.candidates(minDistanceFromCenter).filter((node) => component.has(node.id));
  }

  private traverse(start: string[], neighbors: (id: string) => string[]) {
    const visited = new Set(start);
    const pending = [...start];
    while (pending.length) {
      const id = pending.pop()!;
      for (const next of neighbors(id)) if (!visited.has(next)) {
        visited.add(next);
        pending.push(next);
      }
    }
    return visited;
  }
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function projectOnSegment(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.001) return { point: { ...from }, t: 0 };
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return { point: { x: from.x + dx * t, y: from.y + dy * t }, t };
}

function sameSegment(a: LaneAnchor, b: LaneAnchor) {
  return a.from.id === b.from.id && a.to.id === b.to.id;
}

function compactRoute(route: Point[]) {
  const compact: Point[] = [];
  for (const point of route) {
    const previous = compact[compact.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.25) compact.push({ ...point });
  }
  return compact;
}

/** Connector edges join lane centres, not road centre lines. A short cubic
 * keeps narrow entrances on the destination edge and gives every vehicle a
 * usable turning radius without widening the rendered intersection. */
function routeGeometry(nodes: GraphNode[]) {
  if (nodes.length < 2) return nodes.map(({ x, y }) => ({ x, y }));
  const points: Point[] = [{ x: nodes[0].x, y: nodes[0].y }];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    const edge = from.edges.find((candidate) => candidate.to === to.id);
    if (edge?.connector && index > 0 && index + 2 < nodes.length) {
      const previous = nodes[index - 1];
      const next = nodes[index + 2];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      // Mantém a tangência de entrada/saída sem fazer a curva cúbica escapar
      // da união real dos asfaltos em acessos muito curtos ou estreitos.
      const handle = Math.min(6, Math.max(1, distance * 0.25));
      const incoming = Math.atan2(from.y - previous.y, from.x - previous.x);
      const outgoing = Math.atan2(next.y - to.y, next.x - to.x);
      const controlA = { x: from.x + Math.cos(incoming) * handle, y: from.y + Math.sin(incoming) * handle };
      const controlB = { x: to.x - Math.cos(outgoing) * handle, y: to.y - Math.sin(outgoing) * handle };
      for (const t of [0.25, 0.5, 0.75]) points.push(cubicPoint(from, controlA, controlB, to, t));
    }
    points.push({ x: to.x, y: to.y });
  }
  return points;
}

function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * a.x + 3 * inverse ** 2 * t * b.x + 3 * inverse * t ** 2 * c.x + t ** 3 * d.x,
    y: inverse ** 3 * a.y + 3 * inverse ** 2 * t * b.y + 3 * inverse * t ** 2 * c.y + t ** 3 * d.y
  };
}

function uniqueNodes(nodes: GraphNode[]) {
  return [...new Map(nodes.map((node) => [node.id, node])).values()];
}

type HeapEntry = { id: string; distance: number };

class MinHeap {
  private readonly values: HeapEntry[] = [];
  get size() { return this.values.length; }

  push(value: HeapEntry) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].distance <= value.distance) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop() {
    if (!this.values.length) return undefined;
    const root = this.values[0];
    const tail = this.values.pop()!;
    if (this.values.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.values.length) break;
        const child = right < this.values.length && this.values[right].distance < this.values[left].distance ? right : left;
        if (this.values[child].distance >= tail.distance) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = tail;
    }
    return root;
  }
}
