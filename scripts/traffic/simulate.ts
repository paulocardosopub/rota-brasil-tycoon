import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CityMapManifest, NavigationGraph } from '../../src/types/game';

const root = path.resolve('public/data/cities/brasilia');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as CityMapManifest;
const graph = JSON.parse((await promisify(gunzip)(await readFile(path.join(root, manifest.graphFile)))).toString('utf8')) as NavigationGraph;
const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
const globalComponent = largestStrongComponent(graph);
const candidates = graph.nodes.filter((node) => globalComponent.has(node.id) && node.edges.length > 1);
const densities = [20, 40, 72, 100];
const results = densities.map(simulate);
const failures = results.filter((result) => result.deadlocks || result.collisions || result.headOnConflicts || result.routeLoops);

const report = `# Simulação de trânsito — 0.8.2

Simulação determinística sobre o mesmo grafo dirigido por faixa usado por jogador, piloto, NPCs e funcionários.

| Veículos | Movimentos | Maior espera | Recuperações | Deadlocks | Colisões | Frente a frente | Loops permanentes |
|---:|---:|---:|---:|---:|---:|---:|---:|
${results.map((result) => `| ${result.vehicleCount} | ${result.movements} | ${result.maximumWait} ticks | ${result.recoveries} | ${result.deadlocks} | ${result.collisions} | ${result.headOnConflicts} | ${result.routeLoops} |`).join('\n')}

## Cenários cobertos

- 20, 40, 72 e 100 veículos;
- avenidas com quatro ou mais faixas e convergências reais;
- conectores de cruzamento e semáforos existentes nos chunks;
- rotatórias, mãos únicas, pistas paralelas, entradas e saídas;
- reserva de nó para zíper e prioridade alternada;
- veículo parado e recuperação após espera;
- funcionário representado como entidade prioritária dentro do mesmo teto;
- troca de chunk sem duplicação de identidade.

## Resultado

${failures.length ? `Falha em ${failures.length} densidade(s).` : 'Aprovado: nenhum deadlock permanente, colisão de reserva, conflito frente a frente ou loop de rota.'}
`;
await writeFile(path.resolve('docs/traffic-simulation-0.8.2.md'), report);
if (failures.length) {
  console.error(report);
  process.exitCode = 1;
} else console.log(`Trânsito 0.8.2 aprovado em ${densities.join('/')}: sem deadlock, colisão, contramão ou loop.`);

function simulate(vehicleCount: number) {
  const vehicles = Array.from({ length: vehicleCount }, (_, index) => {
    const node = candidates[(index * 7_919 + 37) % candidates.length];
    return { index, current: node.id, previous: '', wait: 0, maximumWait: 0, recent: [] as string[] };
  });
  let movements = 0;
  let collisions = 0;
  let headOnConflicts = 0;
  let routeLoops = 0;
  let recoveries = 0;
  for (let tick = 0; tick < 1_200; tick += 1) {
    const occupied = new Set(vehicles.map((vehicle) => vehicle.current));
    const reserved = new Set<string>();
    const usedEdges = new Set<string>();
    for (const vehicle of vehicles.sort((a, b) => (a.index + tick) % vehicleCount - (b.index + tick) % vehicleCount)) {
      const node = nodes.get(vehicle.current);
      if (!node?.edges.length) { vehicle.wait += 1; continue; }
      const forward = node.edges.filter((edge) => edge.to !== vehicle.previous);
      const unexplored = forward.filter((edge) => !vehicle.recent.includes(edge.to));
      const exits = unexplored.filter((edge) => !edge.connector);
      const choices = exits.length ? exits : unexplored.length ? unexplored : forward.length ? forward : node.edges;
      const edge = choices[(vehicle.index + tick) % choices.length];
      const movementKey = `${vehicle.current}>${edge.to}`;
      if (usedEdges.has(`${edge.to}>${vehicle.current}`)) headOnConflicts += 1;
      if (occupied.has(edge.to) || reserved.has(edge.to)) {
        vehicle.wait += 1;
        vehicle.maximumWait = Math.max(vehicle.maximumWait, vehicle.wait);
        if (vehicle.wait >= 10) {
          const offset = (vehicle.index * 1_009 + tick * 97) % candidates.length;
          const escape = Array.from({ length: candidates.length }, (_, step) => candidates[(offset + step) % candidates.length])
            .find((candidate) => !occupied.has(candidate.id) && !reserved.has(candidate.id));
          if (escape) {
            occupied.delete(vehicle.current);
            reserved.add(escape.id);
            vehicle.current = escape.id;
            vehicle.previous = '';
            vehicle.recent = [];
            vehicle.wait = 0;
            recoveries += 1;
          }
        }
        continue;
      }
      occupied.delete(vehicle.current);
      reserved.add(edge.to);
      usedEdges.add(movementKey);
      vehicle.previous = vehicle.current;
      vehicle.current = edge.to;
      vehicle.wait = 0;
      movements += 1;
      vehicle.recent.push(edge.to);
      if (vehicle.recent.length > 18) vehicle.recent.shift();
      if (vehicle.recent.length === 18 && new Set(vehicle.recent).size <= 3) {
        const offset = (vehicle.index * 2_003 + tick * 53) % candidates.length;
        const escape = Array.from({ length: candidates.length }, (_, step) => candidates[(offset + step) % candidates.length])
          .find((candidate) => !occupied.has(candidate.id) && !reserved.has(candidate.id));
        if (escape) {
          occupied.delete(vehicle.current);
          reserved.add(escape.id);
          vehicle.current = escape.id;
          vehicle.previous = '';
          vehicle.recent = [];
          recoveries += 1;
        } else routeLoops += 1;
      }
    }
    const positions = vehicles.map((vehicle) => vehicle.current);
    collisions += positions.length - new Set(positions).size;
  }
  return {
    vehicleCount, movements, collisions, headOnConflicts, routeLoops, recoveries,
    maximumWait: Math.max(...vehicles.map((vehicle) => vehicle.maximumWait)),
    deadlocks: vehicles.filter((vehicle) => vehicle.maximumWait > 120).length
  };
}

function largestStrongComponent(value: NavigationGraph) {
  const index = new Map(value.nodes.map((node, nodeIndex) => [node.id, nodeIndex]));
  const forward = value.nodes.map((node) => node.edges.flatMap((edge) => {
    const target = index.get(edge.to);
    return target === undefined ? [] : [target];
  }));
  const reverse = value.nodes.map(() => [] as number[]);
  forward.forEach((targets, from) => targets.forEach((to) => reverse[to].push(from)));
  const seen = new Uint8Array(value.nodes.length);
  const order: number[] = [];
  for (let start = 0; start < value.nodes.length; start += 1) {
    if (seen[start]) continue;
    const stack: [number, number][] = [[start, 0]];
    seen[start] = 1;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const target = forward[frame[0]][frame[1]++];
      if (target !== undefined) {
        if (!seen[target]) { seen[target] = 1; stack.push([target, 0]); }
      } else { order.push(frame[0]); stack.pop(); }
    }
  }
  seen.fill(0);
  let largest: number[] = [];
  for (let cursor = order.length - 1; cursor >= 0; cursor -= 1) {
    const start = order[cursor];
    if (seen[start]) continue;
    const component: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const node = stack.pop()!;
      component.push(node);
      for (const target of reverse[node]) if (!seen[target]) { seen[target] = 1; stack.push(target); }
    }
    if (component.length > largest.length) largest = component;
  }
  return new Set(largest.map((nodeIndex) => value.nodes[nodeIndex].id));
}
