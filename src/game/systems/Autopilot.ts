export function missionApproachTargetSpeed(
  distanceMeters: number,
  interactionRadiusMeters: number,
  brakingMps2: number,
  cruiseSpeedMps: number
) {
  const brakingDistance = Math.max(0.08, distanceMeters - interactionRadiusMeters + 0.08);
  return Math.min(cruiseSpeedMps, Math.sqrt(2 * brakingMps2 * brakingDistance));
}

export function automaticThrottle(speedMps: number, targetSpeedMps: number) {
  const speed = Math.max(0, speedMps);
  const target = Math.max(0, targetSpeedMps);
  const error = target - speed;
  if (target < 0.05 && speed <= 0.45) return 0;
  if (error < -0.45) return clamp(error * 0.34, -1, -0.16);
  if (error > 0.45) return clamp(error * 0.25, 0.16, 1);
  return 0;
}

export type AutopilotRouteState =
  | 'IDLE'
  | 'PREPARING_ROUTE'
  | 'WAITING_FOR_MAP_DATA'
  | 'CALCULATING_ROUTE'
  | 'ROUTE_READY'
  | 'DRIVING'
  | 'ARRIVED'
  | 'ROUTE_FAILED';

export interface AutopilotRouteRequest {
  prepare(signal: AbortSignal, requestId: number): void | Promise<void>;
  calculate(signal: AbortSignal, requestId: number): PointLike[] | Promise<PointLike[]>;
  commit(route: PointLike[], requestId: number): void;
}

type PointLike = { x: number; y: number };

/** Owns the complete lifetime of a route request. A monotonically increasing
 * id and AbortController guarantee that a response from the previous mission
 * can never replace the current route. */
export class AutopilotRouteMachine {
  state: AutopilotRouteState = 'IDLE';
  attempts = 0;
  requestId = 0;
  private controller: AbortController | null = null;

  constructor(
    private readonly maximumAttempts = 2,
    private readonly onState?: (state: AutopilotRouteState) => void
  ) {}

  async request(task: AutopilotRouteRequest) {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const requestId = ++this.requestId;
    this.attempts = 0;

    for (let attempt = 1; attempt <= this.maximumAttempts; attempt += 1) {
      this.attempts = attempt;
      try {
        this.transition('PREPARING_ROUTE');
        this.assertCurrent(requestId, controller.signal);
        this.transition('WAITING_FOR_MAP_DATA');
        await task.prepare(controller.signal, requestId);
        this.assertCurrent(requestId, controller.signal);
        this.transition('CALCULATING_ROUTE');
        const route = await task.calculate(controller.signal, requestId);
        this.assertCurrent(requestId, controller.signal);
        if (route.length < 2) continue;
        task.commit(route, requestId);
        this.assertCurrent(requestId, controller.signal);
        this.transition('ROUTE_READY');
        return true;
      } catch (error) {
        if (controller.signal.aborted || requestId !== this.requestId) return false;
        if (attempt === this.maximumAttempts) {
          console.warn('Falha ao preparar rota do piloto:', error);
        }
      }
    }
    if (requestId === this.requestId && !controller.signal.aborted) this.transition('ROUTE_FAILED');
    return false;
  }

  markDriving() {
    if (this.state === 'ROUTE_READY' || this.state === 'DRIVING') this.transition('DRIVING');
  }

  markArrived() {
    this.controller?.abort();
    this.controller = null;
    this.transition('ARRIVED');
  }

  reset() {
    this.controller?.abort();
    this.controller = null;
    this.requestId += 1;
    this.attempts = 0;
    this.transition('IDLE');
  }

  private assertCurrent(requestId: number, signal: AbortSignal) {
    if (signal.aborted || requestId !== this.requestId) throw new DOMException('Rota substituÃ­da.', 'AbortError');
  }

  private transition(state: AutopilotRouteState) {
    this.state = state;
    this.onState?.(state);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
