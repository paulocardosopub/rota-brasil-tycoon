import type { Point, RoadData } from '../../types/game';

type Segment = { a: Point; b: Point; halfWidth: number };

export class RoadSurfaceIndex {
  private readonly cells = new Map<string, Segment[]>();
  private readonly cellSize = 100;

  constructor(roads: RoadData[]) {
    for (const road of roads) {
      for (let index = 1; index < road.points.length; index += 1) {
        const segment = { a: road.points[index - 1], b: road.points[index], halfWidth: Math.max(3.5, road.width / 2) };
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
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    let surfaceDistance = Number.POSITIVE_INFINITY;
    for (let x = cx - 1; x <= cx + 1; x += 1) for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (const segment of this.cells.get(`${x},${y}`) ?? []) {
        surfaceDistance = Math.min(surfaceDistance, distanceToSegment(point, segment.a, segment.b) - segment.halfWidth);
      }
    }
    return surfaceDistance;
  }
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
