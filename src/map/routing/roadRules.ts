import type { Point, RoadData } from '../../types/game';

const NON_DRIVABLE_HIGHWAYS = new Set(['pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track']);

export function isDrivableRoad(road: Pick<RoadData, 'highway'>) {
  return !NON_DRIVABLE_HIGHWAYS.has(road.highway);
}

export function visibleRoadWidth(road: Pick<RoadData, 'width'>) {
  return Math.max(4.5, Math.min(36, road.width));
}

export function directionalLaneCount(road: Pick<RoadData, 'lanes' | 'oneway'> | undefined) {
  if (!road) return 1;
  return road.oneway ? Math.max(1, road.lanes) : Math.max(1, Math.floor(road.lanes / 2));
}

/** Distance from the centerline to the right-hand traffic lane. */
export function rightHandLaneOffset(road: Pick<RoadData, 'lanes' | 'oneway' | 'width'>, laneIndex = 0) {
  const width = visibleRoadWidth(road);
  const laneCount = Math.max(1, road.lanes);
  const laneWidth = width / laneCount;
  const slot = Math.abs(laneIndex) % laneCount;
  return width / 2 - laneWidth * (slot + 0.5);
}

export function offsetToRightOfTravel(point: Point, from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length || !distance) return { ...point };
  return {
    x: point.x - dy / length * distance,
    y: point.y + dx / length * distance
  };
}

export function pointInTrafficLane(point: Point, from: Point, to: Point, road: RoadData | undefined, laneIndex = 0) {
  return road ? offsetToRightOfTravel(point, from, to, rightHandLaneOffset(road, laneIndex)) : { ...point };
}
