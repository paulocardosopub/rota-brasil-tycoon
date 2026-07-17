import { describe, expect, it } from 'vitest';
import { interestLevel, movementRateHz, shouldSendMovement } from './adaptiveRate';
import { desiredChunkTopics, planChunkHandoff } from './chunkHandoff';
import { normalizeDriverName } from './identity';
import { mixedTrafficBudget } from './trafficBudget';

describe('regras online', () => {
  it('usa taxa adaptativa entre heartbeat e 15 Hz', () => {
    expect(movementRateHz({ speedMps: 0, headingChange: 0, distanceMeters: 10, visible: true, connectionQuality: 1, stopped: true })).toBe(1.5);
    expect(movementRateHz({ speedMps: 22, headingChange: 0.3, distanceMeters: 10, visible: true, connectionQuality: 1, stopped: false })).toBe(15);
    expect(movementRateHz({ speedMps: 8, headingChange: 0, distanceMeters: 800, visible: true, connectionQuality: 1, stopped: false })).toBe(2.5);
    expect(shouldSendMovement(1_000, 1_050, 10)).toBe(false);
    expect(shouldSendMovement(1_000, 1_050, 10, true)).toBe(true);
  });

  it('classifica interesse e troca chunks com sobreposição', () => {
    expect([interestLevel(100), interestLevel(300), interestLevel(900), interestLevel(2_000)]).toEqual(['NEAR', 'MEDIUM', 'DISTANT', 'OUTSIDE']);
    const old = desiredChunkTopics('0_0', ['1_0']);
    const plan = planChunkHandoff(old, '1_0', ['2_0'], [old[0]]);
    expect(plan.subscribe).toContain('city:brasilia:chunk:2_0:movement');
    expect(plan.keep).toContain('city:brasilia:chunk:0_0:movement');
  });

  it('substitui NPCs sem ocultar entidades prioritárias', () => {
    expect(mixedTrafficBudget(72, { nearbyPlayers: 2, onlineEmployees: 3, offlineFleetVehicles: 5, missionVehicles: 0 }))
      .toEqual({ target: 72, protectedVehicles: 10, ambientNpcs: 62, npcReplacements: 10, total: 72 });
    expect(mixedTrafficBudget(72, { nearbyPlayers: 80, onlineEmployees: 0, offlineFleetVehicles: 0, missionVehicles: 1 }).ambientNpcs).toBe(0);
  });

  it('normaliza nome e remove HTML e invisíveis', () => {
    expect(normalizeDriverName('  Ana\u200b   Luz  ')).toBe('Ana Luz');
    expect(normalizeDriverName('<b>')).toBeNull();
  });
});
