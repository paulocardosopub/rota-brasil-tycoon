import type { GraphNode, NavigationGraph, Point, RoadData } from '../../types/game';
import { pointInTrafficLane } from './roadRules';

export class GraphRouter {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly roads = new Map<string, RoadData>();

  constructor(graph: NavigationGraph, roads: RoadData[] = []) {
    for (const node of graph.nodes) this.nodes.set(node.id, node);
    for (const road of roads) this.roads.set(road.id, road);
  }

  nearest(point: Point): GraphNode {
    let best: GraphNode | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const node of this.nodes.values()) {
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
    const nodes = this.findRoute(from, to);
    return nodes?.map(({ x, y }) => ({ x, y })) ?? [];
  }

  drivingRoute(from: Point, to: Point): Point[] {
    const nodes = this.findRoute(from, to);
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

  private findRoute(from: Point, to: Point): GraphNode[] | null {
    const start = this.nearest(from);
    const goal = this.nearest(to);
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
        const nextDistance = entry.distance + edge.distance;
        if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
          distances.set(edge.to, nextDistance);
          previous.set(edge.to, entry.id);
          pending.push({ id: edge.to, distance: nextDistance });
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
