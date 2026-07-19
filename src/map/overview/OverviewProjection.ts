import type { OverviewMapBounds, Point } from '../../types/game';

export function projectOverviewPoint(point: Point, bounds: OverviewMapBounds, paddingPercent = 2.64) {
  const usable = 100 - paddingPercent * 2;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  return {
    left: clamp(paddingPercent + (point.x - bounds.minX) / width * usable, paddingPercent, 100 - paddingPercent),
    top: clamp(paddingPercent + (point.y - bounds.minY) / height * usable, paddingPercent, 100 - paddingPercent)
  };
}

export function pointInsideOverview(point: Point, bounds: OverviewMapBounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
