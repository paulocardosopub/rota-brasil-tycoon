import { describe, expect, it } from 'vitest';
import { AutopilotRouteMachine, automaticThrottle, missionApproachTargetSpeed } from './Autopilot';

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

describe('autopilot route lifecycle', () => {
  it('ignores a late response from the previous mission', async () => {
    const machine = new AutopilotRouteMachine();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const committed: string[] = [];
    const first = machine.request({
      prepare: () => firstGate,
      calculate: () => [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      commit: () => committed.push('old')
    });
    const second = machine.request({
      prepare: () => undefined,
      calculate: () => [{ x: 0, y: 0 }, { x: 2, y: 0 }],
      commit: () => committed.push('new')
    });
    releaseFirst();
    expect(await second).toBe(true);
    expect(await first).toBe(false);
    expect(committed).toEqual(['new']);
    expect(machine.state).toBe('ROUTE_READY');
  });

  it('limits clean retries and stops in ROUTE_FAILED', async () => {
    const machine = new AutopilotRouteMachine(2);
    let calculations = 0;
    const ready = await machine.request({
      prepare: () => undefined,
      calculate: () => { calculations += 1; return []; },
      commit: () => { throw new Error('must not commit'); }
    });
    expect(ready).toBe(false);
    expect(calculations).toBe(2);
    expect(machine.attempts).toBe(2);
    expect(machine.state).toBe('ROUTE_FAILED');
  });

  it('clears request identity, attempts and state on reset', async () => {
    const machine = new AutopilotRouteMachine();
    await machine.request({ prepare: () => undefined, calculate: () => [], commit: () => undefined });
    const failedRequest = machine.requestId;
    machine.reset();
    expect(machine.requestId).toBeGreaterThan(failedRequest);
    expect(machine.attempts).toBe(0);
    expect(machine.state).toBe('IDLE');
  });
});
