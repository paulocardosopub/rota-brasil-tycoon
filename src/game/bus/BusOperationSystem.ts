import type { BusLine, BusOperationSnapshot } from '../../types/game';

export const BUS_FARE = 5.5;

export function idleBusOperation(completedTrips = 0): BusOperationSnapshot {
  return { lineId: null, status: 'idle', currentStopIndex: 0, nextStopName: null, doors: 'closed', occupancy: 0, capacity: 0, boarded: 0, alighted: 0, refused: 0, grossRevenue: 0, delaySeconds: 0, dwellRemainingSeconds: 0, startedAt: null, completedTrips };
}

export function startBusOperation(line: BusLine, capacity: number, now = new Date()): BusOperationSnapshot {
  if (capacity <= 0) throw new Error('Veículo incompatível com transporte coletivo.');
  return { ...idleBusOperation(), lineId: line.id, status: 'heading-to-stop', nextStopName: line.stops[0]?.name ?? null, capacity, startedAt: now.toISOString() };
}

export function arriveAtBusStop(operation: BusOperationSnapshot) {
  if (operation.status !== 'heading-to-stop') return operation;
  return { ...operation, status: 'at-stop' as const, doors: 'closed' as const };
}

export function serviceBusStop(operation: BusOperationSnapshot, line: BusLine) {
  if (operation.status !== 'at-stop' || operation.doors !== 'closed') throw new Error('O ônibus precisa estar parado e com as portas fechadas antes de abri-las.');
  const seed = line.publicCode.split('').reduce((sum, value) => sum + value.charCodeAt(0), 0) + operation.currentStopIndex * 17;
  const alighted = Math.min(operation.occupancy, operation.currentStopIndex === line.stops.length - 1 ? operation.occupancy : Math.floor(operation.occupancy * (0.16 + (seed % 12) / 100)));
  const waiting = 5 + seed % 19;
  const freeSeats = operation.capacity - (operation.occupancy - alighted);
  const boarded = Math.min(waiting, freeSeats);
  const refused = waiting - boarded;
  return { ...operation, doors: 'open' as const, occupancy: operation.occupancy - alighted + boarded, boarded: operation.boarded + boarded, alighted: operation.alighted + alighted, refused: operation.refused + refused, grossRevenue: Math.round((operation.grossRevenue + boarded * BUS_FARE) * 100) / 100, dwellRemainingSeconds: Math.max(2, boarded * 0.45 + alighted * 0.3) };
}

export function advanceBusDwell(operation: BusOperationSnapshot, seconds: number) {
  return operation.doors === 'open' ? { ...operation, dwellRemainingSeconds: Math.max(0, operation.dwellRemainingSeconds - Math.max(0, seconds)) } : operation;
}

export function departBusStop(operation: BusOperationSnapshot, line: BusLine) {
  if (operation.status !== 'at-stop' || operation.doors !== 'open') throw new Error('Abra as portas e conclua o embarque antes de partir.');
  if (operation.dwellRemainingSeconds > 0) throw new Error('O embarque ainda está em andamento.');
  const nextIndex = operation.currentStopIndex + 1;
  if (nextIndex >= line.stops.length) return { ...operation, doors: 'closed' as const, occupancy: 0, status: 'completed' as const, nextStopName: null, dwellRemainingSeconds: 0, completedTrips: operation.completedTrips + 1 };
  return { ...operation, doors: 'closed' as const, status: 'heading-to-stop' as const, currentStopIndex: nextIndex, nextStopName: line.stops[nextIndex].name, dwellRemainingSeconds: 0 };
}
