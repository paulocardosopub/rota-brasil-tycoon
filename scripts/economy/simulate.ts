import { simulateAll } from '../../src/game/economy/EconomySimulator';

const rides = Number(process.argv[2] ?? 30);
const results = simulateAll(Number.isFinite(rides) && rides > 0 ? Math.floor(rides) : 30);
console.table(results);

const average = results.find((result) => result.scenario === 'average')!;
const manual = results.find((result) => result.scenario === 'manual')!;
const autopilot = results.find((result) => result.scenario === 'autopilot')!;
const failures: string[] = [];
if (average.profit <= 0) failures.push('jogador médio não termina lucrativo');
if (average.firstFuelMinute === null || average.firstFuelMinute < 15 || average.firstFuelMinute > 30) failures.push('primeiro abastecimento fora de 15–30 min');
if (average.firstPurchaseMinute === null || average.firstPurchaseMinute < 15 || average.firstPurchaseMinute > 30) failures.push('primeira compra relevante fora de 15–30 min');
if (Math.abs(manual.profit - autopilot.profit) > Math.max(35, autopilot.profit * 0.18)) failures.push('diferença manual/piloto excessiva');
if (failures.length) {
  console.error(`Falhas de balanceamento: ${failures.join('; ')}`);
  process.exitCode = 1;
} else console.log('Balanceamento aprovado para os critérios automáticos da 0.5.0.');
