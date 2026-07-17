export type RecklessRecoveryOptions = {
  thresholdSeconds: number;
  maximumSeconds: number;
  escapeDistanceMeters: number;
};

export type RecklessRecoverySample = {
  deltaSeconds: number;
  blocked: boolean;
  travelledMeters: number;
};

export type RecklessRecoveryUpdate = {
  active: boolean;
  started: boolean;
  finished: boolean;
  blockedSeconds: number;
};

/**
 * Tracks a vehicle that cannot make progress and grants a short, non-solid
 * escape window. Each simulated driver owns one instance so a whole queue can
 * recover instead of only moving the first blocker.
 */
export class RecklessRecovery {
  private blockedSeconds = 0;
  private activeSeconds = 0;
  private escapeDistance = 0;
  private activeRecovery = false;

  constructor(private readonly options: RecklessRecoveryOptions) {}

  get active() {
    return this.activeRecovery;
  }

  get stoppedSeconds() {
    return this.blockedSeconds;
  }

  start(): boolean {
    if (this.activeRecovery) return false;
    this.blockedSeconds = 0;
    this.activeSeconds = 0;
    this.escapeDistance = 0;
    this.activeRecovery = true;
    return true;
  }

  update(sample: RecklessRecoverySample): RecklessRecoveryUpdate {
    const deltaSeconds = Math.max(0, Math.min(0.25, sample.deltaSeconds));
    if (this.activeRecovery) {
      this.activeSeconds += deltaSeconds;
      this.escapeDistance += Math.max(0, sample.travelledMeters);
      const finished = this.activeSeconds >= this.options.maximumSeconds
        || this.escapeDistance >= this.options.escapeDistanceMeters;
      if (finished) this.reset();
      return { active: this.activeRecovery, started: false, finished, blockedSeconds: this.blockedSeconds };
    }

    this.blockedSeconds = sample.blocked ? this.blockedSeconds + deltaSeconds : 0;
    const started = this.blockedSeconds + 1e-6 >= this.options.thresholdSeconds && this.start();
    return { active: this.activeRecovery, started, finished: false, blockedSeconds: this.blockedSeconds };
  }

  reset() {
    this.blockedSeconds = 0;
    this.activeSeconds = 0;
    this.escapeDistance = 0;
    this.activeRecovery = false;
  }
}
