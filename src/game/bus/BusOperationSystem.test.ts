import { describe, expect, it } from 'vitest';
import { BUS_LINES } from './BusTransitConfig';
import { advanceBusDwell, arriveAtBusStop, departBusStop, serviceBusStop, startBusOperation } from './BusOperationSystem';

describe('BusOperationSystem', () => {
  it('embarca, cobra tarifa e avança somente após abrir portas', () => {
    const line = BUS_LINES[0];
    let operation = startBusOperation(line, 24, new Date('2026-01-01T00:00:00Z'));
    operation = arriveAtBusStop(operation);
    operation = serviceBusStop(operation, line);
    expect(operation.doors).toBe('open');
    expect(operation.boarded).toBeGreaterThan(0);
    expect(operation.grossRevenue).toBe(operation.boarded * 5.5);
    operation = advanceBusDwell(operation, 60);
    operation = departBusStop(operation, line);
    expect(operation.currentStopIndex).toBe(1);
    expect(operation.doors).toBe('closed');
  });

  it('registra recusados quando o veículo está lotado', () => {
    const line = BUS_LINES[1];
    let operation = arriveAtBusStop({ ...startBusOperation(line, 1), occupancy: 1 });
    operation = serviceBusStop(operation, line);
    expect(operation.occupancy).toBeLessThanOrEqual(1);
    expect(operation.refused).toBeGreaterThan(0);
  });
});
