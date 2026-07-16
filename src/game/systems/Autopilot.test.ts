import { describe, expect, it } from 'vitest';
import { automaticThrottle, missionApproachTargetSpeed } from './Autopilot';

describe('autopilot speed control', () => {
  it('keeps cruise speed far from a mission stop', () => {
    expect(missionApproachTargetSpeed(100, 8, 10, 16)).toBe(16);
  });

  it('slows below the interaction limit as it enters the mission area', () => {
    const target = missionApproachTargetSpeed(8, 8, 10, 16);
    expect(target * 3.6).toBeLessThan(5);
    expect(target).toBeGreaterThan(0);
  });

  it('brakes only when above the target and does not reverse at a stop', () => {
    expect(automaticThrottle(12, 5)).toBeLessThan(0);
    expect(automaticThrottle(3, 8)).toBeGreaterThan(0);
    expect(automaticThrottle(0.3, 0)).toBe(0);
  });
});
