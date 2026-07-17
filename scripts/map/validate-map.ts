import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CityMapChunk, CityMapManifest, LaneData, MapBuilding, MapMetadata,
  MapServiceLocation, NavigationGraph, RoadData, TaxiPoint
} from '../../src/types/game';
import { GraphRouter } from '../../src/map/routing/GraphRouter';

const root = path.resolve('public/data/cities/brasilia');
const docs = path.resolve('docs');
const read = async <T>(filename: string) => JSON.parse(await readFile(path.join(root, filename), 'utf8')) as T;
const unzip = promisify(gunzip);
const manifest = await read<CityMapManifest>('manifest.json');
const metadata = await read<MapMetadata>('metadata.json');
const graph = JSON.parse((await unzip(await readFile(path.join(root, manifest.graphFile)))).toString('utf8')) as NavigationGraph;
const [fuel, workshops, garages, taxiPoints] = await Promise.all([
  read<MapServiceLocation[]>('central/services/fuel-stations.json'),
  read<MapServiceLocation[]>('central/services/workshops.json'),
  read<MapServiceLocation[]>('central/services/garages.json'),
  read<TaxiPoint[]>('central/services/taxi-points.json')
]);

const errors: string[] = [];
const warnings: string[] = [];
const roads = new Map<string, RoadData>();
const lanes = new Map<string, LaneData>();
const buildings = new Map<string, MapBuilding>();
const chunkIds = new Set(manifest.chunks.map((chunk) => chunk.id));
let totalChunkBytes = 0;
let signalCount = 0;
let stopCount = 0;

if (manifest.mapVersion !== 'brasilia-0.7.0') errors.push('Versão do mapa divergente da 0.7.0.');
if (metadata.license !== 'Open Database License (ODbL) 1.0') errors.push('Licença ODbL ausente.');
if (new Set(manifest.chunks.map((chunk) => chunk.id)).size !== manifest.chunks.length) errors.push('IDs de chunk duplicados.');
for (const entry of manifest.chunks) {
  const filename = path.join(root, entry.file);
  const source = await readFile(filename, 'utf8');
  totalChunkBytes += Buffer.byteLength(source);
  const chunk = JSON.parse(source) as CityMapChunk;
  if (chunk.id !== entry.id) errors.push(`Chunk ${entry.id} possui ID interno divergente.`);
  if (chunk.roads.length !== entry.roadCount || chunk.lanes.length !== entry.laneCount) errors.push(`Contagem divergente no chunk ${entry.id}.`);
  signalCount += chunk.signals.length;
  stopCount += chunk.busStops.length;
  for (const adjacent of entry.adjacent) {
    if (chunkIds.has(adjacent)) continue;
    const [x, y] = adjacent.split('_').map(Number);
    const bounds = manifest.bbox;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !bounds) errors.push(`Adjacência inválida em ${entry.id}: ${adjacent}.`);
  }
  for (const road of chunk.roads) {
    const previous = roads.get(road.id);
    if (previous && (previous.width !== road.width || previous.lanes !== road.lanes || previous.oneway !== road.oneway)) {
      errors.push(`Via ${road.id} muda de configuração entre chunks.`);
    }
    roads.set(road.id, road);
    if (road.points.length < 2 || road.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) errors.push(`Via inválida: ${road.id}.`);
    if ((road.lanesForward ?? 0) + (road.lanesBackward ?? 0) !== road.lanes) errors.push(`Soma de faixas inválida: ${road.id}.`);
    if (road.oneway && (road.lanesBackward ?? 0) !== 0) errors.push(`Mão única com faixa contrária: ${road.id}.`);
    if ((road.bridge || road.tunnel) && !Number.isFinite(road.layer)) errors.push(`Ponte/túnel sem layer: ${road.id}.`);
  }
  for (const lane of chunk.lanes) {
    const previous = lanes.get(lane.id);
    if (previous && (previous.direction !== lane.direction || previous.roadSegmentId !== lane.roadSegmentId)) errors.push(`Faixa conflitante entre chunks: ${lane.id}.`);
    lanes.set(lane.id, lane);
    if (lane.points.length < 2 || lane.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) errors.push(`Geometria inválida na faixa ${lane.id}.`);
    if (lane.direction === 'backward' && roads.get(lane.roadSegmentId)?.oneway) errors.push(`Faixa contra a mão na via ${lane.roadSegmentId}.`);
  }
  for (const building of chunk.buildings) buildings.set(building.id, building);
}

const graphIds = new Set<string>();
const graphLaneIds = new Set<string>();
let edgeCount = 0;
let connectorCount = 0;
for (const node of graph.nodes) {
  if (graphIds.has(node.id)) errors.push(`Nó duplicado: ${node.id}.`);
  graphIds.add(node.id);
  if (node.laneId) graphLaneIds.add(node.laneId);
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) errors.push(`Nó com coordenada inválida: ${node.id}.`);
  edgeCount += node.edges.length;
  connectorCount += node.edges.filter((edge) => edge.connector).length;
}
for (const node of graph.nodes) for (const edge of node.edges) {
  if (!graphIds.has(edge.to)) errors.push(`Aresta órfã ${node.id} → ${edge.to}.`);
  if (edge.distance < 0 || !Number.isFinite(edge.distance)) errors.push(`Distância inválida em ${node.id}.`);
}
for (const laneId of graphLaneIds) if (!lanes.has(laneId)) errors.push(`Grafo referencia faixa ausente: ${laneId}.`);

const corridors = groupBy([...roads.values()], (road) => road.corridorId ?? road.id);
let abruptWidthWarnings = 0;
for (const corridor of corridors.values()) {
  const widths = corridor.map((road) => road.width);
  const minimum = Math.min(...widths);
  const maximum = Math.max(...widths);
  if (minimum > 0 && maximum / minimum > 1.25) abruptWidthWarnings += 1;
}
if (abruptWidthWarnings) warnings.push(`${abruptWidthWarnings} corredores possuem variação real/explicitada acima de 25% e exigem inspeção visual.`);

const router = new GraphRouter(graph);
const routeResults: string[] = [];
for (let index = 0; index < manifest.regions.length; index += 1) {
  const from = manifest.regions[index];
  const to = manifest.regions[(index + 1) % manifest.regions.length];
  const route = router.drivingRoute(from.center, to.center);
  const distance = router.distance(route);
  routeResults.push(`${from.name} → ${to.name}: ${(distance / 1_000).toFixed(1)} km`);
  if (route.length < 2 || distance < 300) errors.push(`Rota entre regiões indisponível: ${from.name} → ${to.name}.`);
}
for (const service of [...fuel, ...workshops, ...garages]) {
  if (router.drivingRoute({ x: 0, y: 0 }, service.entrance).length < 2) errors.push(`Serviço sem acesso global: ${service.id}.`);
}
for (const taxi of taxiPoints) if (router.drivingRoute({ x: 0, y: 0 }, taxi.entrance).length < 2) errors.push(`Ponto de táxi sem acesso: ${taxi.id}.`);

const latKm = (manifest.bbox.north - manifest.bbox.south) * 111.195;
const lonKm = (manifest.bbox.east - manifest.bbox.west) * 111.195 * Math.cos(manifest.origin.lat * Math.PI / 180);
const areaKm2 = latKm * lonKm;
if (areaKm2 < 16) errors.push(`Área publicada insuficiente: ${areaKm2.toFixed(1)} km².`);
if (manifest.regions.length < 7) errors.push('Cobertura regional insuficiente.');
if (roads.size < 5_000 || graph.nodes.length < 20_000 || manifest.chunks.length < 20) errors.push('Malha 0.7 abaixo do volume mínimo.');

const report = `# Auditoria da malha viária — 0.7.0

- Área do bounding box: **${areaKm2.toFixed(1)} km²**;
- Chunks publicados: **${manifest.chunks.length}**;
- Vias canônicas: **${roads.size}**;
- Faixas detalhadas: **${lanes.size}**;
- Faixas no grafo global: **${graphLaneIds.size}**;
- Nós globais: **${graph.nodes.length}**;
- Arestas dirigidas: **${edgeCount}** (${connectorCount} conectores de junção);
- Edifícios em LOD: **${buildings.size}**;
- Semáforos nos chunks: **${signalCount}**;
- Pontos de ônibus nos chunks: **${stopCount}**;
- Dados locais de chunks: **${(totalChunkBytes / 1_048_576).toFixed(1)} MB**, carregados por janela.

## Rotas entre regiões

${routeResults.map((route) => `- ${route}`).join('\n')}

## Alertas

${warnings.length ? warnings.map((warning) => `- ${warning}`).join('\n') : '- Nenhum alerta estrutural.'}

## Resultado

${errors.length ? `Falhou com ${errors.length} erro(s).` : 'Aprovada sem erros estruturais.'}
`;
await writeFile(path.join(docs, 'road-network-audit-0.7.0.md'), report);

if (errors.length) {
  console.error(errors.slice(0, 80).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Mapa 0.7 validado: ${roads.size} vias, ${lanes.size} faixas, ${graph.nodes.length} nós, ${manifest.chunks.length} chunks, ${areaKm2.toFixed(1)} km².`);
}

function groupBy<T>(values: T[], keyFor: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}
