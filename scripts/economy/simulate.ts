import { simulateAll } from '../../src/game/economy/EconomySimulator';
import { simulatePlayable060 } from '../../src/game/economy/FleetEconomySimulator';
import { simulateRegionalEconomy } from '../../src/game/economy/RegionalEconomySimulator';

const rides = Number(process.argv[2] ?? 30);
const results = simulateAll(Number.isFinite(rides) && rides > 0 ? Math.floor(rides) : 30);
console.table(results);

console.log('\nCenários regionais da 0.8.2 (antes/depois):');
console.table(simulateRegionalEconomy());

const playable060 = simulatePlayable060();
console.log('\nCenários jogáveis, táxi e frota preservados na 0.8.2:');
console.table(playable060.results);
console.log('\nMarcos de progressão:');
console.table([playable060.milestones]);

const average = results.find((result) => result.scenario === 'average')!;
const manual = results.find((result) => result.scenario === 'manual')!;
const autopilot = results.find((result) => result.scenario === 'autopilot')!;
const failures: string[] = [];
if (average.profit <= 0) failures.push('jogador médio não termina lucrativo');
if (average.firstFuelMinute === null || average.firstFuelMinute < 15 || average.firstFuelMinute > 30) failures.push('primeiro abastecimento fora de 15–30 min');
if (average.firstPurchaseMinute === null || average.firstPurchaseMinute < 15 || average.firstPurchaseMinute > 30) failures.push('primeira compra relevante fora de 15–30 min');
if (Math.abs(manual.profit - autopilot.profit) > Math.max(35, autopilot.profit * 0.18)) failures.push('diferença manual/piloto excessiva');

const manualTaxi = playable060.results.find((result) => result.scenario === 'manual-taxi')!;
const employee = playable060.results.find((result) => result.scenario === 'first-employee')!;
const offline = playable060.results.find((result) => result.scenario === 'offline-eight-hours')!;
if (employee.netProfit <= 0) failures.push('primeiro funcionário não gera lucro líquido');
if (manualTaxi.netProfit <= employee.netProfit) failures.push('jogador ativo não possui vantagem sobre renda passiva inicial');
if (offline.netProfit >= employee.netProfit * 8) failures.push('renda offline cresce linearmente sem os limites operacionais');

if (failures.length) {
  console.error(`Falhas de balanceamento: ${failures.join('; ')}`);
  process.exitCode = 1;
} else console.log('Balanceamento aprovado para os critérios automáticos da 0.8.2.');
