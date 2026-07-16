import type { CameraZoom, HudSnapshot, PlayerSave, Quality, ServiceCategory, TrafficDensity, VehicleUpgradeId } from '../types/game';
import type { WorkshopServiceId } from './economy/ExpenseCalculator';

export type GameCommand =
  | { type: 'mobile-input'; throttle: number; steering: number; handbrake: boolean }
  | { type: 'pause' }
  | { type: 'camera' }
  | { type: 'autopilot' }
  | { type: 'set-quality'; quality: Quality }
  | { type: 'set-camera-zoom'; zoom: CameraZoom }
  | { type: 'set-camera-shake'; enabled: boolean }
  | { type: 'set-traffic-density'; density: TrafficDensity }
  | { type: 'set-audio'; enabled: boolean; masterVolume?: number; engineVolume?: number; effectsVolume?: number }
  | { type: 'cancel-ride' }
  | { type: 'dismiss-receipt' }
  | { type: 'accept-ride' }
  | { type: 'reject-ride' }
  | { type: 'navigate-service'; serviceId: string }
  | { type: 'navigate-nearest-service'; category: Extract<ServiceCategory, 'fuel' | 'workshop'> }
  | { type: 'clear-service-route' }
  | { type: 'buy-fuel'; liters: number | 'full'; requestId: string }
  | { type: 'workshop-service'; service: WorkshopServiceId; requestId: string }
  | { type: 'buy-upgrade'; upgrade: VehicleUpgradeId; requestId: string }
  | { type: 'pay-debt'; value: number; requestId: string }
  | { type: 'regularize-taxi'; requestId: string }
  | { type: 'convert-taxi'; requestId: string }
  | { type: 'hire-employee'; candidateId: string; requestId: string }
  | { type: 'buy-fleet-vehicle'; requestId: string }
  | { type: 'assign-employee'; employeeId: string; vehicleId: string }
  | { type: 'unassign-employee'; employeeId: string }
  | { type: 'start-fleet-shift'; employeeId: string; requestId: string }
  | { type: 'end-fleet-shift' }
  | { type: 'select-vehicle'; vehicleId: string }
  | { type: 'ack-fleet-report' }
  | { type: 'follow-fleet-vehicle' }
  | { type: 'dev'; action: string };

type GameEvents = {
  hud: HudSnapshot;
  save: PlayerSave;
  toast: { message: string; tone?: 'info' | 'success' | 'warning' };
  command: GameCommand;
};

type Listener<T> = (payload: T) => void;

class TypedEventBus {
  private readonly target = new EventTarget();

  emit<K extends keyof GameEvents>(name: K, payload: GameEvents[K]) {
    this.target.dispatchEvent(new CustomEvent(String(name), { detail: payload }));
  }

  on<K extends keyof GameEvents>(name: K, listener: Listener<GameEvents[K]>) {
    const wrapped = (event: Event) => listener((event as CustomEvent<GameEvents[K]>).detail);
    this.target.addEventListener(String(name), wrapped);
    return () => this.target.removeEventListener(String(name), wrapped);
  }
}

export const gameEvents = new TypedEventBus();
