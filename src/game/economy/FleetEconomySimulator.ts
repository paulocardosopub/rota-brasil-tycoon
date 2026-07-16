import { createNewSave } from '../../services/storage/saveService';
import type { PlayerSave } from '../../types/game';
import { advanceFleetShift, assignEmployee, hireEmployee, purchaseSecondVehicle, startFleetShift } from '../fleet/FleetService';
import { regularizeTaxi } from '../progression/RegularizationService';
import { roundMoney } from './TransactionLedger';
import { simulateEconomy } from './EconomySimulator';

export type Playable060Scenario =
  | 'clandestine-player' | 'manual-taxi' | 'autopilot-taxi' | 'first-employee'
  | 'shared-vehicle' | 'two-vehicles' | 'one-hour' | 'four-hours' | 'offline-eight-hours'
  | 'safe-driver' | 'inexperienced-driver' | 'low-maintenance';

export interface Playable060SimulationResult {
  scenario: Playable060Scenario;
  hours: number;
  rides: number;
  kilometers: number;
  grossRevenue: number;
  costs: number;
  netProfit: number;
  returnHours: number | null;
  stoppageChancePercent: number;
  maintenanceDueHours: number;
}

export interface Playable060Milestones {
  regularizationMinutes: number | null;
  firstHireMinutes: number | null;
  secondVehicleMinutes: number | null;
}

export function simulatePlayable060() {
  const oneHour = employeeOperation('bia-rocha', 1);
  const fourHours = employeeOperation('bia-rocha', 4);
  const offline = employeeOperation('bia-rocha', 8, { offline: true });
  const inexperienced = employeeOperation('leo-martins', 4);
  const lowMaintenance = employeeOperation('bia-rocha', 4, { lowMaintenance: true });
  const manual = playerOperation('manual-taxi', oneHour, 1.22);
  const autopilot = playerOperation('autopilot-taxi', oneHour, 1.13);
  const clandestine = clandestineOperation();
  const results: Playable060SimulationResult[] = [
    clandestine, manual, autopilot, { ...oneHour, scenario: 'first-employee' },
    scaleResult(oneHour, 'shared-vehicle', 0.72), combineResults(manual, oneHour),
    { ...oneHour, scenario: 'one-hour' }, { ...fourHours, scenario: 'four-hours' },
    { ...offline, scenario: 'offline-eight-hours' }, { ...fourHours, scenario: 'safe-driver' },
    { ...inexperienced, scenario: 'inexperienced-driver' }, { ...lowMaintenance, scenario: 'low-maintenance' }
  ];
  return { results, milestones: economyMilestones() };
}

function employeeOperation(candidateId: 'bia-rocha' | 'leo-martins', hours: number, options: { offline?: boolean; lowMaintenance?: boolean } = {}): Playable060SimulationResult {
  const save = readyFleet(candidateId);
  const employee = save.fleet.employees[0];
  const vehicle = save.fleet.vehicles.find((item) => item.model === 'Sedan 2012')!;
  const start = new Date('2026-07-16T08:00:00.000Z');
  startFleetShift(save, employee.id, `sim-shift-${candidateId}-${hours}-${options.offline ? 'offline' : 'live'}`, start);
  save.fleet.activeShift!.scheduledEndAt = new Date(start.getTime() + Math.max(hours, 4) * 3_600_000).toISOString();
  if (options.lowMaintenance) {
    vehicle.collisionDamage = 50; vehicle.maintenanceWear = 10; vehicle.condition = 45.5;
  }
  const effectiveHours = options.offline && hours > 4 ? 4 + (Math.min(8, hours) - 4) * 0.65 : Math.min(hours, 8);
  const result = advanceFleetShift(save, effectiveHours * 3_600, options.offline === true);
  const shift = save.fleet.activeShift;
  const report = result.report;
  const rides = report?.rides ?? shift?.rides ?? 0;
  const kilometers = report?.kilometers ?? shift?.kilometers ?? 0;
  const gross = report?.grossRevenue ?? shift?.grossRevenue ?? 0;
  const costs = roundMoney((report?.fuelCost ?? shift?.fuelCost ?? 0) + (report?.commission ?? shift?.commission ?? 0) + (report?.repairs ?? shift?.maintenanceCost ?? 0) + (report?.fines ?? shift?.fines ?? 0));
  const net = report?.netProfit ?? shift?.netProfit ?? 0;
  return {
    scenario: candidateId === 'bia-rocha' ? 'safe-driver' : 'inexperienced-driver', hours, rides,
    kilometers: roundMoney(kilometers), grossRevenue: roundMoney(gross), costs, netProfit: roundMoney(net),
    returnHours: net > 0 ? roundMoney(650 / Math.max(0.01, net / hours)) : null,
    stoppageChancePercent: options.lowMaintenance ? 82 : candidateId === 'bia-rocha' ? 4 : 14,
    maintenanceDueHours: options.lowMaintenance ? 0.2 : roundMoney(Math.max(1, (vehicle.nextMaintenanceKm - vehicle.totalKm) / Math.max(1, kilometers / hours)))
  };
}

function playerOperation(scenario: 'manual-taxi' | 'autopilot-taxi', employee: Playable060SimulationResult, multiplier: number): Playable060SimulationResult {
  const net = roundMoney(employee.netProfit * multiplier);
  const costs = roundMoney(employee.costs * 0.72);
  return { ...employee, scenario, rides: scenario === 'manual-taxi' ? employee.rides + 1 : employee.rides, grossRevenue: roundMoney(net + costs), costs, netProfit: net, returnHours: null, stoppageChancePercent: scenario === 'manual-taxi' ? 7 : 3 };
}

function clandestineOperation(): Playable060SimulationResult {
  const result = simulateEconomy('average', 15);
  const hours = result.minutes / 60;
  return { scenario: 'clandestine-player', hours, rides: result.rides, kilometers: result.totalKm, grossRevenue: roundMoney(result.profit), costs: 0, netProfit: roundMoney(result.profit), returnHours: null, stoppageChancePercent: 12, maintenanceDueHours: 8 };
}

function scaleResult(result: Playable060SimulationResult, scenario: Playable060Scenario, factor: number): Playable060SimulationResult {
  return { ...result, scenario, rides: Math.floor(result.rides * factor), kilometers: roundMoney(result.kilometers * factor), grossRevenue: roundMoney(result.grossRevenue * factor), costs: roundMoney(result.costs * factor), netProfit: roundMoney(result.netProfit * factor), returnHours: result.returnHours ? roundMoney(result.returnHours / factor) : null };
}

function combineResults(player: Playable060SimulationResult, employee: Playable060SimulationResult): Playable060SimulationResult {
  return { scenario: 'two-vehicles', hours: 1, rides: player.rides + employee.rides, kilometers: roundMoney(player.kilometers + employee.kilometers), grossRevenue: roundMoney(player.grossRevenue + employee.grossRevenue), costs: roundMoney(player.costs + employee.costs), netProfit: roundMoney(player.netProfit + employee.netProfit), returnHours: employee.returnHours, stoppageChancePercent: Math.max(player.stoppageChancePercent, employee.stoppageChancePercent), maintenanceDueHours: Math.min(player.maintenanceDueHours, employee.maintenanceDueHours) };
}

function readyFleet(candidateId: 'bia-rocha' | 'leo-martins'): PlayerSave {
  const save = createNewSave();
  save.money = 10_000; save.completedRides = 20; save.xp = 1_000; save.rating = 4.8; save.totalKm = 30;
  regularizeTaxi(save, `sim-regularize-${candidateId}`);
  hireEmployee(save, candidateId, `sim-hire-${candidateId}`);
  purchaseSecondVehicle(save, `sim-sedan-${candidateId}`);
  const employee = save.fleet.employees[0];
  const sedan = save.fleet.vehicles.find((vehicle) => vehicle.model === 'Sedan 2012')!;
  assignEmployee(save, employee.id, sedan.id);
  return save;
}

function economyMilestones(): Playable060Milestones {
  let regularizationMinutes: number | null = null;
  for (let rides = 15; rides <= 50 && regularizationMinutes === null; rides += 1) regularizationMinutes = simulateEconomy('regularization', rides).regularizationMinute;
  const firstHireMinutes = regularizationMinutes === null ? null : regularizationMinutes + 35;
  const secondVehicleMinutes = firstHireMinutes === null ? null : firstHireMinutes + 150;
  return { regularizationMinutes, firstHireMinutes, secondVehicleMinutes };
}
