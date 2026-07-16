import type { Point, RoadData } from '../../types/game';

type Segment = { a: Point; b: Point; halfWidth: number };

export interface NearestRoad {
  centerDistance: number;
  surfaceDistance: number;
  closest: Point;
  tangentAngle: number;
  halfWidth: number;
}

export class RoadSurfaceIndex {
  private readonly cells = new Map<string, Segment[]>();
  private readonly cellSize = 100;

  constructor(roads: RoadData[]) {
    for (const road of roads) {
      for (let index = 1; index < road.points.length; index += 1) {
        // Keep collision and rendered asphalt at exactly the same scale.
        const visibleWidth = Math.max(4.5, Math.min(18, road.width));
        const segment = { a: road.points[index - 1], b: road.points[index], halfWidth: visibleWidth / 2 };
        const minX = Math.floor((Math.min(segment.a.x, segment.b.x) - segment.halfWidth) / this.cellSize);
        const maxX = Math.floor((Math.max(segment.a.x, segment.b.x) + segment.halfWidth) / this.cellSize);
        const minY = Math.floor((Math.min(segment.a.y, segment.b.y) - segment.halfWidth) / this.cellSize);
        const maxY = Math.floor((Math.max(segment.a.y, segment.b.y) + segment.halfWidth) / this.cellSize);
        for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
          const key = `${x},${y}`;
          const cell = this.cells.get(key) ?? [];
          cell.push(segment);
          this.cells.set(key, cell);
        }
      }
    }
  }

  distanceFromRoad(point: Point) {
    return this.nearestRoad(point)?.surfaceDistance ?? Number.POSITIVE_INFINITY;
  }

  nearestRoad(point: Point): NearestRoad | null {
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    let best: NearestRoad | null = null;
    for (let x = cx - 1; x <= cx + 1; x += 1) for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (const segment of this.cells.get(`${x},${y}`) ?? []) {
        const closest = closestPointOnSegment(point, segment.a, segment.b);
        const centerDistance = Math.hypot(point.x - closest.x, point.y - closest.y);
        const candidate: NearestRoad = {
          centerDistance,
          surfaceDistance: centerDistance - segment.halfWidth,
          closest,
          tangentAngle: Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x),
          halfWidth: segment.halfWidth
        };
        // The nearest centerline is stable on Brasília's many parallel carriageways.
        // Choosing by surface width can make assistance jump to an adjacent avenue.
        if (!best || candidate.centerDistance < best.centerDistance ||
          (candidate.centerDistance === best.centerDistance && candidate.surfaceDistance < best.surfaceDistance)) best = candidate;
      }
    }
    return best;
  }
}

function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return { ...a };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
