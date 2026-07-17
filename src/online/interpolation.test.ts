import { describe, expect, it } from 'vitest';
import type { MovementSnapshot } from './protocol';
import { RemoteInterpolationBuffer } from './interpolation';

function snapshot(sequence: number, clientTime: number, localX: number, heading = 0): MovementSnapshot {
  return { protocolVersion: 1, sessionId: 'rbs_12345678', publicPlayerId: 'rbp_12345678', vehicleId: 'rbp_12345678__vehicle-one', sequence,
    serverTimeOffset: 0, clientTime, mapVersion: 'brasilia-0.8.2', chunkId: '0_0', localX, localY: 0, layer: 0,
    heading, speed: 10, acceleration: 0, vehicleState: 'free', autopilot: false, turnSignal: 'none', braking: false,
    controllerType: 'PLAYER', vehicleModel: 'Hatch 1998', colorId: 'amber', fleetPublicId: null };
}

describe('buffer remoto', () => {
  it('interpola posição e ângulo sem salto', () => {
    const buffer = new RemoteInterpolationBuffer();
    buffer.push(snapshot(1, 1_000, 0, Math.PI * 0.9));
    buffer.push(snapshot(2, 1_200, 20, -Math.PI * 0.9));
    const state = buffer.sample(1_220)!;
    expect(state.position.x).toBeCloseTo(10);
    expect(Math.abs(state.heading)).toBeGreaterThan(2.8);
    expect(state.extrapolating).toBe(false);
  });

  it('ignora duplicado e fora de ordem e limita extrapolação', () => {
    const buffer = new RemoteInterpolationBuffer();
    expect(buffer.push(snapshot(2, 1_000, 0))).toBe(true);
    expect(buffer.push(snapshot(2, 1_000, 0))).toBe(false);
    expect(buffer.push(snapshot(1, 900, 0))).toBe(false);
    expect(buffer.duplicates).toBe(1);
    expect(buffer.outOfOrder).toBe(1);
    expect(buffer.sample(1_300)?.extrapolating).toBe(true);
    expect(buffer.sample(2_000)?.frozen).toBe(true);
  });
});
