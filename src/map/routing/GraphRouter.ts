import type { GraphEdge, GraphNode, NavigationGraph, Point, RoadData } from '../../types/game';
import { pointInTrafficLane } from './roadRules';

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
  score: number;
};

export class GraphRouter {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly roads = new Map<string, RoadData>();
  private readonly spatialNodes = new Map<string, GraphNode[]>();
  private readonly spatialSegments = new Map<string, DirectedSegment[]>();
  private readonly incomingCount = new Map<string, number>();
  private readonly spatialCellSize = 120;
  private readonly laneGraph: boolean;

  constructor(graph: NavigationGraph, roads: RoadData[] = []) {
    this.laneGraph = graph.kind === 'lane';
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node);
      const key = this.spatialKey(node);
      const cell = this.spatialNodes.get(key) ?? [];
      cell.push(node);
      this.spatialNodes.set(key, cell);
    }
    for (const node of graph.nodes) for (const edge of node.edges) {
      this.incomingCount.set(edge.to, (this.incomingCount.get(edge.to) ?? 0) + 1);
      const target = this.nodes.get(edge.to);
      if (this.laneGraph && target) this.indexSegment(node, target, edge);
    }
    for (const road of roads) this.roads.set(road.id, road);
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
    return nodes?.map(({ x, y }) => ({ x, y })) ?? [];
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
      const fallback = this.findRoute(from, to, preferredStartHeading, true);
      return fallback?.map(({ x, y }) => ({ x, y })) ?? [];
    }

    for (const start of starts) {
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
        ...route.map(({ x, y }) => ({ x, y })),
        goal.point
      ]);
    }
    return [];
  }

  private laneAnchors(point: Point, heading?: number) {
    const segments = this.nearbySegments(point);
    if (!segments.length) return [];
    const anchors = segments.map((segment): LaneAnchor => {
      const projection = projectOnSegment(point, segment.from, segment.to);
      const lateralDistance = Math.hypot(point.x - projection.point.x, point.y - projection.point.y);
      const headingError = heading === undefined ? 0 : Math.abs(angleDelta(heading, segment.heading));
      return {
        ...segment,
        point: projection.point,
        t: projection.t,
        lateralDistance,
        headingError,
        score: lateralDistance * 20 + headingError * 42 + (segment.edge.connector ? 3 : 0)
      };
    });
    const nearestDistance = Math.min(...anchors.map((anchor) => anchor.lateralDistance));
    const nearest = anchors.filter((anchor) => anchor.lateralDistance <= nearestDistance + 2.5);
    const directionallyValid = heading === undefined
      ? nearest
      : nearest.filter((anchor) => anchor.headingError <= 1.25);
    return (directionallyValid.length ? directionallyValid : nearest)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);
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
