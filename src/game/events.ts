import type { HudSnapshot, PlayerSave, Quality } from '../types/game';

export type GameCommand =
  | { type: 'mobile-input'; throttle: number; steering: number; handbrake: boolean }
  | { type: 'pause' }
  | { type: 'camera' }
  | { type: 'set-quality'; quality: Quality }
  | { type: 'cancel-ride' }
  | { type: 'dismiss-receipt' }
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
