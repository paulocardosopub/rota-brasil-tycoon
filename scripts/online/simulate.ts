import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Scenario = { players: number; playersPerChunk: number; movingShare: number; slowShare: number; stoppedShare: number; employeesPerPlayer: number };

const scenarios: Scenario[] = [
  { players: 10, playersPerChunk: 5, movingShare: .6, slowShare: .2, stoppedShare: .2, employeesPerPlayer: .2 },
  { players: 100, playersPerChunk: 10, movingShare: .65, slowShare: .2, stoppedShare: .15, employeesPerPlayer: .25 },
  { players: 1_000, playersPerChunk: 25, movingShare: .7, slowShare: .2, stoppedShare: .1, employeesPerPlayer: .3 }
];

const payloadBytes = 310;
const proIncludedMessages = 5_000_000;
const proIncludedConnections = 500;
const messagePackage = 1_000_000;
const messagePackageUsd = 2.5;
const connectionPackage = 1_000;
const connectionPackageUsd = 10;

const results = scenarios.map(simulate);
console.table(results.map((row) => ({
  players: row.players, actors: row.actors, chunks: row.chunks, avgHz: row.averageAdaptiveHz,
  sentPerSecond: row.sentPerSecond, billedPerSecond: row.billedPerSecond,
  billedPerHour: row.billedPerHour, trafficPerPlayerMBHour: row.trafficPerPlayerMBHour,
  estimated60hUsd: row.estimated60hUsd
})));

const report = `# Orçamento de mensagens — Online Alpha 0.8.0

Gerado por \`npm run online:simulate\`. Não executa carga contra produção; é um modelo local reproduzível.

## Hipóteses

- snapshot compacto médio: ${payloadBytes} bytes antes do envelope WebSocket;
- taxa adaptativa ponderada: movimento rápido/normal a 12 Hz, lento a 5 Hz e parado a 1,5 Hz;
- um funcionário público adicional por parte dos jogadores, usando a mesma taxa;
- fan-out restrito ao chunk: uma emissão conta como uma mensagem enviada e uma por destinatário no mesmo chunk;
- 60 horas de uso no mês para a estimativa, sem incluir o preço base do plano, egress ou impostos;
- referência de preço em 17/07/2026: Pro inclui 5 milhões de mensagens e 500 conexões de pico; excedente em pacotes de 1 milhão a US$ 2,50 e 1.000 conexões a US$ 10.

| Jogadores | Atores com funcionários | Chunks | Densidade/chunk | Hz adaptativo | Envios/s | Mensagens faturáveis/s | Mensagens/h | MB/h por jogador | Estimativa 60 h (US$) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${results.map((r) => `| ${r.players} | ${r.actors} | ${r.chunks} | ${r.actorsPerChunk} | ${r.averageAdaptiveHz.toFixed(2)} | ${r.sentPerSecond.toLocaleString('pt-BR')} | ${r.billedPerSecond.toLocaleString('pt-BR')} | ${r.billedPerHour.toLocaleString('pt-BR')} | ${r.trafficPerPlayerMBHour.toFixed(1)} | ${r.estimated60hUsd.toFixed(2)} |`).join('\n')}

## Efeito da taxa adaptativa

| Jogadores | Mensagens/h adaptativas | Mensagens/h a 15 Hz | Redução |
|---:|---:|---:|---:|
${results.map((r) => `| ${r.players} | ${r.billedPerHour.toLocaleString('pt-BR')} | ${r.fixed15BilledPerHour.toLocaleString('pt-BR')} | ${(100 * (1 - r.billedPerHour / r.fixed15BilledPerHour)).toFixed(1)}% |`).join('\n')}

## Leitura operacional

10 jogadores cabem no alpha com folga de conexão, mas o fan-out ainda torna sessões longas relevantes para a franquia mensal. Com 100 jogadores, deve-se usar Pro sem limite gratuito como premissa de staging e acompanhar o relatório de Realtime. O cenário de 1.000 jogadores excede o limite padrão agregado de mensagens por segundo e exige reduzir densidade/frequência, dividir mundos ou contratar limite maior; ele não deve ser disparado contra o projeto público.

O modelo é conservador: jogadores fora da área de interesse não recebem movimento direto, chunks vazios não geram broadcast e veículos parados caem para heartbeat. Presence, handoff e eventos visuais representam pequena parcela adicional e devem ser conferidos no painel de uso antes de ampliar o alpha.
`;

writeFileSync(resolve('docs/online-message-budget-0.8.0.md'), report, 'utf8');

function simulate(scenario: Scenario) {
  const employees = Math.ceil(scenario.players * scenario.employeesPerPlayer);
  const actors = scenario.players + employees;
  const chunks = Math.max(1, Math.ceil(scenario.players / scenario.playersPerChunk));
  const actorsPerChunk = Math.ceil(actors / chunks);
  const averageAdaptiveHz = scenario.movingShare * 12 + scenario.slowShare * 5 + scenario.stoppedShare * 1.5;
  const sentPerSecond = Math.round(actors * averageAdaptiveHz);
  const recipients = Math.max(0, actorsPerChunk - 1);
  const billedPerSecond = sentPerSecond * (1 + recipients);
  const billedPerHour = billedPerSecond * 3_600;
  const fixed15BilledPerHour = actors * 15 * (1 + recipients) * 3_600;
  const deliveredBytesPerHour = billedPerHour * payloadBytes;
  const trafficPerPlayerMBHour = deliveredBytesPerHour / Math.max(1, scenario.players) / 1_000_000;
  const monthlyMessages = billedPerHour * 60;
  const messageOverage = Math.max(0, monthlyMessages - proIncludedMessages);
  const messageCost = Math.ceil(messageOverage / messagePackage) * messagePackageUsd;
  const connectionOverage = Math.max(0, scenario.players - proIncludedConnections);
  const connectionCost = Math.ceil(connectionOverage / connectionPackage) * connectionPackageUsd;
  return { ...scenario, employees, actors, chunks, actorsPerChunk, averageAdaptiveHz, sentPerSecond, billedPerSecond, billedPerHour, fixed15BilledPerHour, trafficPerPlayerMBHour, estimated60hUsd: messageCost + connectionCost };
}
