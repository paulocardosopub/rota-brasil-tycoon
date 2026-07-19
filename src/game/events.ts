import type { AccountLinkState, BusinessKind, CameraZoom, EmployeeQualification, EmployeeRegionalPreferences, HudSnapshot, PlayerSave, Quality, RegionPreference, ServiceCategory, TrafficDensity, VehicleModel, VehicleUpgradeId } from '../types/game';
import type { WorkshopServiceId } from './economy/ExpenseCalculator';

export type GameCommand =
  | { type: 'mobile-input'; throttle: number; steering: number; handbrake: boolean }
  | { type: 'pause' }
  | { type: 'camera' }
  | { type: 'autopilot' }
  | { type: 'toggle-autopilot-sport' }
  | { type: 'set-quality'; quality: Quality }
  | { type: 'set-camera-zoom'; zoom: CameraZoom }
  | { type: 'set-camera-shake'; enabled: boolean }
  | { type: 'set-reduced-world-effects'; enabled: boolean }
  | { type: 'set-traffic-density'; density: TrafficDensity }
  | { type: 'set-audio'; enabled: boolean; masterVolume?: number; engineVolume?: number; effectsVolume?: number }
  | { type: 'set-online-mode'; mode: 'online' | 'solo' }
  | { type: 'set-account-link-state'; state: AccountLinkState }
  | { type: 'set-online-visibility'; setting: 'showPlayerNames' | 'showFleetNames' | 'showPlayersOnMap' | 'remoteSounds' | 'publicPresence'; enabled: boolean }
  | { type: 'set-online-visual-limit'; limit: number }
  | { type: 'set-preferred-region'; regionId: RegionPreference }
  | { type: 'set-employee-regional-preferences'; employeeId: string; preferences: Partial<EmployeeRegionalPreferences> }
  | { type: 'cancel-ride' }
  | { type: 'dismiss-receipt' }
  | { type: 'accept-ride' }
  | { type: 'reject-ride' }
  | { type: 'generate-work'; business: 'delivery' | 'light-freight' }
  | { type: 'navigate-service'; serviceId: string }
  | { type: 'navigate-nearest-service'; category: ServiceCategory }
  | { type: 'clear-service-route' }
  | { type: 'buy-fuel'; liters: number | 'full'; requestId: string }
  | { type: 'workshop-service'; service: WorkshopServiceId; requestId: string }
  | { type: 'buy-upgrade'; upgrade: VehicleUpgradeId; requestId: string }
  | { type: 'pay-debt'; value: number; requestId: string }
  | { type: 'regularize-taxi'; requestId: string }
  | { type: 'convert-taxi'; requestId: string }
  | { type: 'hire-employee'; candidateId: string; requestId: string }
  | { type: 'buy-fleet-vehicle'; requestId: string; model?: 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020' }
  | { type: 'buy-regional-garage'; serviceId: string; requestId: string }
  | { type: 'purchase-business'; kind: Exclude<BusinessKind, 'taxi'>; garageId: string; requestId: string }
  | { type: 'purchase-light-vehicle'; model: Exclude<VehicleModel, 'Hatch 1998' | 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020'>; garageId: string; requestId: string }
  | { type: 'start-bus-line'; lineId: string }
  | { type: 'service-bus-stop' }
  | { type: 'depart-bus-stop' }
  | { type: 'train-employee'; employeeId: string; qualification: EmployeeQualification; requestId: string }
  | { type: 'transfer-fleet-entity'; entityKind: 'vehicle' | 'employee'; entityId: string; targetGarageId: string; requestId: string }
  | { type: 'assign-employee'; employeeId: string; vehicleId: string }
  | { type: 'unassign-employee'; employeeId: string }
  | { type: 'start-fleet-shift'; employeeId: string; requestId: string }
  | { type: 'confirm-fleet-shift-preparation'; employeeId: string; requestId: string }
  | { type: 'cancel-fleet-shift-preparation' }
  | { type: 'end-fleet-shift' }
  | { type: 'select-vehicle'; vehicleId: string }
  | { type: 'view-fleet-vehicle'; vehicleId: string }
  | { type: 'stop-viewing-vehicle' }
  | { type: 'assume-fleet-vehicle'; vehicleId: string }
  | { type: 'return-fleet-vehicle' }
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
