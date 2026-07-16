import type { CollisionSeverity, PlayerSettings } from '../../types/game';

export class GameAudio {
  private context?: AudioContext;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private ambience?: OscillatorNode;
  private ambienceGain?: GainNode;
  private settings?: PlayerSettings;
  private lastBrakeAt = 0;

  unlock(settings: PlayerSettings) {
    this.settings = settings;
    if (!settings.audio) return;
    if (!this.context) this.createContext();
    void this.context?.resume();
  }

  update(speedMps: number, throttle: number, braking: boolean, settings: PlayerSettings) {
    this.settings = settings;
    if (!this.context || !this.engine || !this.engineGain || !this.ambienceGain) return;
    const enabled = settings.audio && this.context.state === 'running';
    const speedRatio = Math.min(1, Math.abs(speedMps) / 25);
    this.engine.frequency.setTargetAtTime(62 + speedRatio * 105 + Math.max(0, throttle) * 24, this.context.currentTime, 0.06);
    this.engineGain.gain.setTargetAtTime(enabled ? settings.masterVolume * settings.engineVolume * (0.035 + speedRatio * 0.055) : 0, this.context.currentTime, 0.08);
    this.ambienceGain.gain.setTargetAtTime(enabled ? settings.masterVolume * 0.006 : 0, this.context.currentTime, 0.2);
    if (braking && speedRatio > 0.25 && this.context.currentTime - this.lastBrakeAt > 0.7) {
      this.lastBrakeAt = this.context.currentTime;
      this.effect(135, 0.1, 0.13, 'sawtooth');
    }
  }

  horn() {
    this.effect(390, 0.18, 0.16, 'square');
  }

  signal() {
    this.effect(760, 0.08, 0.1, 'sine');
  }

  collision(severity: CollisionSeverity | null) {
    if (!severity || severity === 'contact') return;
    const frequency = severity === 'light' ? 110 : severity === 'moderate' ? 75 : 48;
    const duration = severity === 'light' ? 0.1 : severity === 'moderate' ? 0.2 : 0.32;
    this.effect(frequency, duration, 0.22, 'sawtooth');
  }

  destroy() {
    this.engine?.stop();
    this.ambience?.stop();
    void this.context?.close();
  }

  private createContext() {
    this.context = new AudioContext();
    this.engine = this.context.createOscillator();
    this.engineGain = this.context.createGain();
    this.engine.type = 'triangle';
    this.engineGain.gain.value = 0;
    this.engine.connect(this.engineGain).connect(this.context.destination);
    this.engine.start();
    this.ambience = this.context.createOscillator();
    this.ambienceGain = this.context.createGain();
    this.ambience.type = 'sine';
    this.ambience.frequency.value = 38;
    this.ambienceGain.gain.value = 0;
    this.ambience.connect(this.ambienceGain).connect(this.context.destination);
    this.ambience.start();
  }

  private effect(frequency: number, duration: number, volume: number, type: OscillatorType) {
    if (!this.context || !this.settings?.audio || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * 0.7), now + duration);
    gain.gain.setValueAtTime(volume * this.settings.masterVolume * this.settings.effectsVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
