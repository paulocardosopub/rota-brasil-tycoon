import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../config/gameConfig';
import { deserializeMovement, movementPayloadBytes, serializeMovement, snapshotWorldPosition, validateMovement, type MovementSnapshot } from './protocol';

const base: MovementSnapshot = {
  protocolVersion: 1, sessionId: 'rbs_12345678', publicPlayerId: 'rbp_12345678', vehicleId: 'rbp_12345678__vehicle-hatch-1998',
  sequence: 1, serverTimeOffset: 0, clientTime: 1_000, mapVersion: GAME_CONFIG.mapVersion, chunkId: '-2_3',
  localX: 125.25, localY: 400.5, layer: 0, heading: 0.3, speed: 8, acceleration: 1.2,
  vehicleState: 'free', autopilot: false, turnSignal: 'none', braking: false, controllerType: 'PLAYER',
  vehicleModel: 'Hatch 1998', colorId: 'amber', fleetPublicId: 'rbf_12345678'
};

describe('protocolo de movimento online', () => {
  it('serializa em tupla compacta e restaura sem dados privados', () => {
    const wire = serializeMovement(base);
    expect(wire).toHaveLength(23);
    expect(deserializeMovement(wire)).toEqual(base);
    expect(movementPayloadBytes(base)).toBeLessThan(GAME_CONFIG.online.movementPayloadBytes);
    expect(JSON.stringify(wire)).not.toContain('money');
  });

  it('converte coordenadas locais do chunk para o mundo', () => {
    expect(snapshotWorldPosition(base)).toEqual({ x: -1_474.75, y: 2_800.5 });
  });

  it('rejeita sequência antiga, velocidade e teleporte impossíveis', () => {
    expect(validateMovement({ ...base, sequence: 0 }, base)).toMatchObject({ valid: false, reason: 'sequence' });
    expect(validateMovement({ ...base, speed: 90 })).toMatchObject({ valid: false, reason: 'speed', suspicious: true });
    expect(validateMovement({ ...base, sequence: 2, clientTime: 1_050, localX: 700 }, base)).toMatchObject({ valid: false, reason: 'teleport' });
  });
});
