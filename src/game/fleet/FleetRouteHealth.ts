export type FleetRecoveryReason = 'off-route' | 'orbit' | 'no-progress';

export interface FleetRouteHealthSample {
  deltaSeconds: number;
  deviationMeters: number;
  remainingMeters: number;
  rotation: number;
  speedMps: number;
  shouldBeMoving: boolean;
}

export interface FleetRecoveryRequest {
  reason: FleetRecoveryReason;
  repositionAhead: boolean;
}

/** Detects a moving vehicle that is orbiting without advancing its route. */
export class FleetRouteHealth {
  private bestRemaining = Number.POSITIVE_INFINITY;
  private noProgressSeconds = 0;
  private offRouteSeconds = 0;
  private accumulatedTurn = 0;
  private previousRotation: number | null = null;
  private recoveriesWithoutProgress = 0;
  private progressAfterRecovery = 0;

  update(sample: FleetRouteHealthSample): FleetRecoveryRequest | null {
    const delta = Math.max(0, Math.min(0.25, sample.deltaSeconds));
    const improved = sample.remainingMeters + 0.75 < this.bestRemaining;
    if (improved) {
      const improvement = Number.isFinite(this.bestRemaining) ? this.bestRemaining - sample.remainingMeters : 0;
      this.bestRemaining = sample.remainingMeters;
      this.noProgressSeconds = 0;
      this.accumulatedTurn = 0;
      this.progressAfterRecovery += Math.max(0, improvement);
      if (this.progressAfterRecovery >= 12) {
        this.recoveriesWithoutProgress = 0;
        this.progressAfterRecovery = 0;
      }
    } else if (sample.shouldBeMoving && Math.abs(sample.speedMps) > 2) {
      this.noProgressSeconds += delta;
      if (this.previousRotation !== null) this.accumulatedTurn += Math.abs(angleDelta(this.previousRotation, sample.rotation));
    }

    this.offRouteSeconds = sample.shouldBeMoving && sample.deviationMeters > 28
      ? this.offRouteSeconds + delta
      : 0;
    this.previousRotation = sample.rotation;

    if (this.offRouteSeconds >= 2.5) return this.requestRecovery('off-route', sample.remainingMeters);
    if (this.noProgressSeconds >= 7 && this.accumulatedTurn >= Math.PI * 1.55) {
      return this.requestRecovery('orbit', sample.remainingMeters);
    }
    if (this.noProgressSeconds >= 14) return this.requestRecovery('no-progress', sample.remainingMeters);
    return null;
  }

  reset(remainingMeters = Number.POSITIVE_INFINITY, rotation?: number) {
    this.bestRemaining = remainingMeters;
    this.noProgressSeconds = 0;
    this.offRouteSeconds = 0;
    this.accumulatedTurn = 0;
    this.previousRotation = Number.isFinite(rotation) ? rotation! : null;
    this.recoveriesWithoutProgress = 0;
    this.progressAfterRecovery = 0;
  }

  routeReplanned(remainingMeters: number, rotation: number) {
    if (!Number.isFinite(this.bestRemaining)) this.bestRemaining = remainingMeters;
    this.previousRotation = rotation;
  }

  recoveryApplied(remainingMeters: number, rotation: number) {
    this.bestRemaining = remainingMeters;
    this.noProgressSeconds = 0;
    this.offRouteSeconds = 0;
    this.accumulatedTurn = 0;
    this.previousRotation = rotation;
  }

  private requestRecovery(reason: FleetRecoveryReason, remainingMeters: number): FleetRecoveryRequest {
    this.recoveriesWithoutProgress += 1;
    this.progressAfterRecovery = 0;
    this.recoveryApplied(remainingMeters, this.previousRotation ?? 0);
    return { reason, repositionAhead: this.recoveriesWithoutProgress >= 2 };
  }
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
