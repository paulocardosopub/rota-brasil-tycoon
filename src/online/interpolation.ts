import { GAME_CONFIG } from '../config/gameConfig';
import type { Point } from '../types/game';
import { snapshotWorldPosition, type MovementSnapshot } from './protocol';

export interface InterpolatedRemoteState {
  position: Point;
  heading: number;
  speed: number;
  braking: boolean;
  stale: boolean;
  extrapolating: boolean;
  frozen: boolean;
}

export class RemoteInterpolationBuffer {
  private snapshots: MovementSnapshot[] = [];
  private lastSequence = -1;
  duplicates = 0;
  outOfOrder = 0;
  lost = 0;

  push(snapshot: MovementSnapshot) {
    if (snapshot.sequence === this.lastSequence) { this.duplicates += 1; return false; }
    if (snapshot.sequence < this.lastSequence) { this.outOfOrder += 1; return false; }
    if (this.lastSequence >= 0 && snapshot.sequence > this.lastSequence + 1) this.lost += snapshot.sequence - this.lastSequence - 1;
    this.lastSequence = snapshot.sequence;
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 24) this.snapshots.splice(0, this.snapshots.length - 24);
    return true;
  }

  sample(now: number, serverOffset = 0): InterpolatedRemoteState | null {
    if (!this.snapshots.length) return null;
    const renderTime = now + serverOffset - GAME_CONFIG.online.interpolationDelayMs;
    while (this.snapshots.length > 2 && this.snapshots[1].clientTime <= renderTime) this.snapshots.shift();
    const from = this.snapshots[0];
    const to = this.snapshots[1];
    if (to && from.clientTime <= renderTime && renderTime <= to.clientTime) {
      const amount = clamp((renderTime - from.clientTime) / Math.max(1, to.clientTime - from.clientTime), 0, 1);
      const a = snapshotWorldPosition(from);
      const b = snapshotWorldPosition(to);
      return {
        position: { x: lerp(a.x, b.x, amount), y: lerp(a.y, b.y, amount) },
        heading: lerpAngle(from.heading, to.heading, amount), speed: lerp(from.speed, to.speed, amount),
        braking: to.braking, stale: false, extrapolating: false, frozen: false
      };
    }
    const latest = this.snapshots[this.snapshots.length - 1];
    const age = Math.max(0, renderTime - latest.clientTime);
    const base = snapshotWorldPosition(latest);
    if (age <= GAME_CONFIG.online.maximumExtrapolationMs) {
      const seconds = age / 1_000;
      return {
        position: { x: base.x + Math.cos(latest.heading) * latest.speed * seconds, y: base.y + Math.sin(latest.heading) * latest.speed * seconds },
        heading: latest.heading, speed: latest.speed, braking: latest.braking,
        stale: age > GAME_CONFIG.online.staleAfterMs, extrapolating: age > 0, frozen: false
      };
    }
    const stale = age > GAME_CONFIG.online.staleAfterMs;
    return { position: base, heading: latest.heading, speed: 0, braking: latest.braking, stale, extrapolating: false, frozen: true };
  }

  get size() { return this.snapshots.length; }
  get sequence() { return this.lastSequence; }
  get latest() { return this.snapshots[this.snapshots.length - 1] ?? null; }
}

function lerp(a: number, b: number, amount: number) { return a + (b - a) * amount; }
function lerpAngle(a: number, b: number, amount: number) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * amount; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
