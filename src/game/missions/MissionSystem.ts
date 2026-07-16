import { GAME_CONFIG } from '../../config/gameConfig';
import { calculateFare } from '../economy/fare';
import { GraphRouter } from '../../map/routing/GraphRouter';
import type { GraphNode, MissionSnapshot, Point, Receipt } from '../../types/game';

export class MissionSystem {
  mission: MissionSnapshot;
  route: Point[] = [];
  receipt: Receipt | null = null;
  private candidateNodes: GraphNode[] = [];

  constructor(private readonly router: GraphRouter, start: Point, completedRides: number) {
    this.candidateNodes = this.pickReachableCandidates(start);
    this.mission = this.createMission(start, completedRides);
  }

  private pickReachableCandidates(start: Point) {
    const all = this.router.candidates(80);
    const stride = Math.max(1, Math.floor(all.length / 120));
    return all.filter((_, index) => index % stride === 0).flatMap((node) => {
      const route = this.router.route(start, node);
      const distance = this.router.distance(route);
      return route.length > 2 && distance > 80 && distance < 1_500 ? [{ node, distance }] : [];
    }).sort((a, b) => a.distance - b.distance).slice(0, 64).map(({ node }) => node);
  }

  private createMission(start: Point, rideIndex: number): MissionSnapshot {
    const pool = this.candidateNodes.length >= 8 ? this.candidateNodes : this.router.candidates(40);
    const nearbyCount = Math.max(1, Math.min(16, pool.length));
    const pickup = pool[(rideIndex * 7) % nearbyCount];
    let destination = pool[(rideIndex * 11 + Math.floor(pool.length / 2)) % pool.length];
    for (let offset = 1; offset < pool.length; offset += 1) {
      const candidate = pool[(rideIndex * 11 + Math.floor(pool.length / 2) + offset) % pool.length];
      const testRoute = this.router.route(pickup, candidate);
      const distance = this.router.distance(testRoute);
      if (testRoute.length > 2 && distance > 180 && distance < 1_700) {
        destination = candidate;
        break;
      }
    }
    this.route = this.router.drivingRoute(start, pickup);
    const labels = GAME_CONFIG.mission.locationLabels;
    return {
      id: `ride-${Date.now()}-${rideIndex}`,
      passengerName: GAME_CONFIG.mission.passengerNames[rideIndex % GAME_CONFIG.mission.passengerNames.length],
      phase: 'pickup',
      pickup: { x: pickup.x, y: pickup.y },
      destination: { x: destination.x, y: destination.y },
      pickupLabel: labels[(rideIndex * 2) % labels.length],
      destinationLabel: labels[(rideIndex * 2 + 5) % labels.length],
      distanceTravelled: 0,
      elapsedSeconds: 0
    };
  }

  update(
    position: Point,
    speedKmh: number,
    deltaSeconds: number,
    travelled: number,
    rating: number,
    interactionRadiusMeters: number = GAME_CONFIG.mission.interactionRadiusMeters,
    maxInteractionSpeedKmh: number = GAME_CONFIG.mission.maxInteractionSpeedKmh
  ) {
    if (this.mission.phase === 'passenger-on-board') {
      this.mission.elapsedSeconds += deltaSeconds;
      this.mission.distanceTravelled += travelled;
    }
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    const distance = Math.hypot(position.x - target.x, position.y - target.y);
    const stoppedCorrectly = distance <= interactionRadiusMeters && speedKmh <= maxInteractionSpeedKmh;
    if (this.mission.phase === 'pickup' && stoppedCorrectly) {
      this.mission.phase = 'passenger-on-board';
      this.route = this.router.drivingRoute(position, this.mission.destination);
      return 'picked-up' as const;
    }
    if (this.mission.phase === 'passenger-on-board' && stoppedCorrectly) {
      this.mission.phase = 'completed';
      this.receipt = calculateFare(this.mission.distanceTravelled, this.mission.elapsedSeconds, rating);
      this.route = [];
      return 'completed' as const;
    }
    return null;
  }

  recalculate(position: Point) {
    if (this.mission.phase === 'completed' || this.mission.phase === 'cancelled') return;
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    this.route = this.router.drivingRoute(position, target);
  }

  advanceRoute(position: Point) {
    if (this.route.length < 2) return Number.POSITIVE_INFINITY;
    let bestIndex = 0;
    let bestPoint = this.route[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    let scannedDistance = 0;
    const firstSegmentLength = Math.hypot(
      this.route[1].x - this.route[0].x,
      this.route[1].y - this.route[0].y
    );
    const maximumScanDistance = Math.max(45, firstSegmentLength + 35);
    // Only inspect the nearby, upcoming part of the active route. Within that
    // window the closest segment wins, so zero-length points and completed
    // corners cannot pin navigation behind the vehicle.
    const lastIndex = Math.min(this.route.length - 1, 20);
    for (let index = 0; index < lastIndex; index += 1) {
      const start = this.route[index];
      const end = this.route[index + 1];
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      if (scannedDistance > maximumScanDistance) break;
      scannedDistance += segmentLength;
      if (segmentLength < 0.1) continue;
      const point = closestPointOnSegment(position, start, end);
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
        bestPoint = point;
      }
    }
    if (bestDistance <= 24) {
      const remaining = this.route.slice(bestIndex + 1);
      while (
        remaining.length
        && Math.hypot(remaining[0].x - bestPoint.x, remaining[0].y - bestPoint.y) < 0.1
      ) remaining.shift();
      this.route = [bestPoint, ...remaining];
    }
    return bestDistance;
  }

  cancel() {
    const afterPickup = this.mission.phase === 'passenger-on-board';
    this.mission.phase = 'cancelled';
    this.route = [];
    return afterPickup;
  }

  next(position: Point, completedRides: number) {
    this.receipt = null;
    this.mission = this.createMission(position, completedRides);
  }

  remainingDistance(position: Point) {
    if (!this.route.length) return 0;
    return Math.hypot(position.x - this.route[0].x, position.y - this.route[0].y) + this.router.distance(this.route);
  }

  targetDistance(position: Point) {
    const target = this.mission.phase === 'pickup' ? this.mission.pickup : this.mission.destination;
    return Math.hypot(position.x - target.x, position.y - target.y);
  }
}

function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return { ...a };
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return { x: a.x + dx * t, y: a.y + dy * t };
}
