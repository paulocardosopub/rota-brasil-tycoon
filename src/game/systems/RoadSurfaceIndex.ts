import type { Point, RoadData } from '../../types/game';
import { isDrivableRoad, offsetToRightOfTravel, rightHandLaneOffset, visibleRoadWidth } from '../../map/routing/roadRules';

type Segment = {
  a: Point;
  b: Point;
  halfWidth: number;
  roadId: string;
  oneway: boolean;
  lanes: number;
  width: number;
};

export interface NearestRoad {
  centerDistance: number;
  surfaceDistance: number;
  unionSurfaceDistance: number;
  closest: Point;
  tangentAngle: number;
  halfWidth: number;
  roadId: string;
  oneway: boolean;
  lanes: number;
  width: number;
}

export class RoadSurfaceIndex {
  private readonly cells = new Map<string, Segment[]>();
  private readonly cellSize = 100;

  constructor(roads: RoadData[]) {
    this.replaceRoads(roads);
  }

  replaceRoads(roads: RoadData[]) {
    this.cells.clear();
    for (const road of roads) {
      if (!isDrivableRoad(road)) continue;
      for (let index = 1; index < road.points.length; index += 1) {
        const width = visibleRoadWidth(road);
        const segment: Segment = {
          a: road.points[index - 1],
          b: road.points[index],
          halfWidth: width / 2,
          roadId: road.id,
          oneway: road.oneway,
          lanes: road.lanes,
          width
        };
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
    return this.nearestRoad(point)?.unionSurfaceDistance ?? Number.POSITIVE_INFINITY;
  }

  nearestRoad(point: Point, preferredHeading?: number): NearestRoad | null {
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    let best: NearestRoad | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let unionSurfaceDistance = Number.POSITIVE_INFINITY;
    for (let x = cx - 1; x <= cx + 1; x += 1) for (let y = cy - 1; y <= cy + 1; y += 1) {
      for (const segment of this.cells.get(`${x},${y}`) ?? []) {
        const closest = closestPointOnSegment(point, segment.a, segment.b);
        const centerDistance = Math.hypot(point.x - closest.x, point.y - closest.y);
        const surfaceDistance = centerDistance - segment.halfWidth;
        unionSurfaceDistance = Math.min(unionSurfaceDistance, surfaceDistance);
        const tangentAngle = Math.atan2(segment.b.y - segment.a.y, segment.b.x - segment.a.x);
        const candidate: NearestRoad = {
          centerDistance,
          surfaceDistance,
          unionSurfaceDistance: surfaceDistance,
          closest,
          tangentAngle,
          halfWidth: segment.halfWidth,
          roadId: segment.roadId,
          oneway: segment.oneway,
          lanes: segment.lanes,
          width: segment.width
        };
        // In junctions, prefer the road aligned with the vehicle. The union
        // distance remains independent so crossing asphalt never becomes a wall.
        const headingDifference = preferredHeading === undefined
          ? 0
          : angleDelta(preferredHeading, tangentAngle);
        const headingPenalty = preferredHeading === undefined
          ? 0
          : segment.oneway
            // sin(π) is zero, so the former score considered an opposite
            // one-way carriageway perfectly aligned. Penalize its direction.
            ? (1 - Math.cos(headingDifference)) * 42
            : Math.abs(Math.sin(headingDifference)) * 9;
        const score = centerDistance + Math.max(0, surfaceDistance) * 4 + headingPenalty;
        if (!best || score < bestScore || (score === bestScore && surfaceDistance < best.surfaceDistance)) {
          best = candidate;
          bestScore = score;
        }
      }
    }
    if (best) best.unionSurfaceDistance = unionSurfaceDistance;
    return best;
  }

  laneCenter(road: NearestRoad, heading: number, laneIndex = 0): Point {
    const travelHeading = road.oneway ? road.tangentAngle : closestHeading(heading, road.tangentAngle);
    const from = { x: road.closest.x, y: road.closest.y };
    const to = { x: from.x + Math.cos(travelHeading), y: from.y + Math.sin(travelHeading) };
    return offsetToRightOfTravel(from, from, to, rightHandLaneOffset(road, laneIndex));
  }
}

function closestHeading(current: number, tangent: number) {
  const reverse = tangent + Math.PI;
  return Math.abs(angleDelta(current, tangent)) <= Math.abs(angleDelta(current, reverse)) ? tangent : reverse;
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return { ...a };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
