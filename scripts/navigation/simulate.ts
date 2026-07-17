import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GraphRouter } from '../../src/map/routing/GraphRouter';
import type { NavigationGraph } from '../../src/types/game';

const graph = JSON.parse(gunzipSync(
  readFileSync('public/data/cities/brasilia/lane-graph.json.gz')
).toString('utf8')) as NavigationGraph;
const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const starts = graph.nodes.filter((node) => node.edges.some((edge) => !edge.connector));
const router = new GraphRouter(graph);
const failures: string[] = [];
let tested = 0;

for (let sample = 0; sample < 96; sample += 1) {
  const start = starts[(sample * 997) % starts.length];
  const edge = start.edges.find((candidate) => !candidate.connector);
  const next = edge ? nodeById.get(edge.to) : undefined;
  const target = starts[(sample * 7_919 + 12_345) % starts.length];
  if (!edge || !next || target.id === start.id) continue;
  const position = { x: (start.x + next.x) / 2, y: (start.y + next.y) / 2 };
  const heading = Math.atan2(next.y - start.y, next.x - start.x);
  const route = router.drivingRoute(position, target, heading);
  tested += 1;
  if (route.length < 2) {
    failures.push(`${start.id}: rota ausente`);
    continue;
  }
  const entryHeading = Math.atan2(route[1].y - route[0].y, route[1].x - route[0].x);
  const entryError = Math.abs(angleDelta(heading, entryHeading));
  if (entryError > 0.35) failures.push(`${start.id}: entrada divergiu ${(entryError * 180 / Math.PI).toFixed(1)}°`);
  const end = route[route.length - 1];
  const endDistance = Math.hypot(end.x - target.x, end.y - target.y);
  if (endDistance > 2.5) failures.push(`${start.id}: destino ficou a ${endDistance.toFixed(1)} m da faixa`);
}

console.log(`Navegação global: ${tested} rotas dirigidas auditadas, ${failures.length} falhas.`);
if (failures.length) {
  console.error(failures.slice(0, 20).join('\n'));
  process.exitCode = 1;
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
