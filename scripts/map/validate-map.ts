import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CityMapChunk, CityMapManifest, LaneData, MapBuilding, MapMetadata,
  MapServiceLocation, NavigationGraph, RoadData, TaxiPoint
} from '../../src/types/game';
import { GraphRouter } from '../../src/map/routing/GraphRouter';
import { pointInPolygon } from '../../src/map/regions/RegionCatalog';
import type { PackedNavigationGraph } from '../../src/map/pipeline/RoadPipeline';

const root = path.resolve('public/data/cities/brasilia');
const docs = path.resolve('docs');
const read = async <T>(filename: string) => JSON.parse(await readFile(path.join(root, filename), 'utf8')) as T;
const unzip = promisify(gunzip);
const limits = JSON.parse(await readFile(path.resolve('data/map-validation/brasilia.json'), 'utf8')) as {
  mapVersion: string;
  shortOscillationMeters: number;
  maximumEndpointWidthDeltaMeters: number;
  maximumWidthGradientPerMeter: number;
  minimumTaperLaneWidthMeters: number;
  maximumLaneWidthMeters: number;
  maximumConnectorSegmentMeters: number;
  maximumEntranceWidthRatio: number;
  maximumDisconnectedLaneShare: number;
  maximumGraphSurfaceMismatchMeters: number;
};
const manifest = await read<CityMapManifest>('manifest.json');
const metadata = await read<MapMetadata>('metadata.json');
const graph = unpackNavigationGraph(JSON.parse(
  (await unzip(await readFile(path.join(root, manifest.graphFile)))).toString('utf8')
) as NavigationGraph | PackedNavigationGraph);
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

if (manifest.mapVersion !== limits.mapVersion) errors.push(`Versão do mapa divergente de ${limits.mapVersion}.`);
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
    if (previous) continue;
    if (road.points.length < 2 || road.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) errors.push(`Via inválida: ${road.id}.`);
    if ((road.lanesForward ?? 0) + (road.lanesBackward ?? 0) !== road.lanes) errors.push(`Soma de faixas inválida: ${road.id}.`);
    if (road.oneway && (road.lanesBackward ?? 0) !== 0) errors.push(`Mão única com faixa contrária: ${road.id}.`);
    if ((road.bridge || road.tunnel) && !Number.isFinite(road.layer)) errors.push(`Ponte/túnel sem layer: ${road.id}.`);
    if (!road.oneway && ((road.lanesForward ?? 0) < 1 || (road.lanesBackward ?? 0) < 1)) errors.push(`Via de mão dupla sem faixa funcional por sentido: ${road.id}.`);
    if (road.widthProfile && road.widthProfile.length !== road.points.length) errors.push(`Perfil de largura desalinhado: ${road.id}.`);
    const widths = road.widthProfile ?? road.points.map(() => road.width);
    for (let index = 0; index < widths.length; index += 1) {
      const laneWidth = widths[index] / Math.max(1, road.lanes);
      if (laneWidth < limits.minimumTaperLaneWidthMeters || laneWidth > limits.maximumLaneWidthMeters) {
        errors.push(`Largura de faixa fora do limite em ${road.id}: ${laneWidth.toFixed(2)} m.`);
        break;
      }
      if (index === 0) continue;
      const segmentLength = Math.hypot(road.points[index].x - road.points[index - 1].x, road.points[index].y - road.points[index - 1].y);
      if (segmentLength > 0 && Math.abs(widths[index] - widths[index - 1]) / segmentLength > limits.maximumWidthGradientPerMeter) {
        errors.push(`Transição de largura abrupta em ${road.id}.`);
        break;
      }
    }
  }
  for (const lane of chunk.lanes) {
    const previous = lanes.get(lane.id);
    if (previous && (previous.direction !== lane.direction || previous.roadSegmentId !== lane.roadSegmentId)) errors.push(`Faixa conflitante entre chunks: ${lane.id}.`);
    lanes.set(lane.id, lane);
    if (previous) continue;
    if (lane.points.length < 2 || lane.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) errors.push(`Geometria inválida na faixa ${lane.id}.`);
    if (lane.direction === 'backward' && roads.get(lane.roadSegmentId)?.oneway) errors.push(`Faixa contra a mão na via ${lane.roadSegmentId}.`);
  }
  for (const building of chunk.buildings) buildings.set(building.id, building);
}

const graphIds = new Set<string>();
const graphLaneIds = new Set<string>();
const graphRoadIds = new Set<string>();
let edgeCount = 0;
let connectorCount = 0;
let oversizedConnectorSegments = 0;
let graphSurfaceMismatches = 0;
for (const node of graph.nodes) {
  if (graphIds.has(node.id)) errors.push(`Nó duplicado: ${node.id}.`);
  graphIds.add(node.id);
  if (node.laneId) graphLaneIds.add(node.laneId);
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) errors.push(`Nó com coordenada inválida: ${node.id}.`);
  edgeCount += node.edges.length;
  for (const edge of node.edges) graphRoadIds.add(edge.roadId);
  connectorCount += node.edges.filter((edge) => edge.connector).length;
}
for (const node of graph.nodes) for (const edge of node.edges) {
  if (!graphIds.has(edge.to)) errors.push(`Aresta órfã ${node.id} → ${edge.to}.`);
  if (edge.distance < 0 || !Number.isFinite(edge.distance)) errors.push(`Distância inválida em ${node.id}.`);
  if (edge.connector && edge.distance > limits.maximumConnectorSegmentMeters) {
    oversizedConnectorSegments += 1;
    errors.push(`Conector excessivamente aberto em ${node.id}: ${edge.distance.toFixed(1)} m.`);
  }
}
for (const laneId of graphLaneIds) if (!lanes.has(laneId)) errors.push(`Grafo referencia faixa ausente: ${laneId}.`);
const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
for (const node of graph.nodes) for (const edge of node.edges) {
  if (edge.connector) continue;
  const road = roads.get(edge.roadId);
  const target = graphNodeById.get(edge.to);
  if (!road || !target) continue;
  if (roadSurfaceDistance(node, road) > limits.maximumGraphSurfaceMismatchMeters
    || roadSurfaceDistance(target, road) > limits.maximumGraphSurfaceMismatchMeters) {
    graphSurfaceMismatches += 1;
    if (graphSurfaceMismatches <= 40) errors.push(`Geometria visual diverge do grafo em ${node.id}.`);
  }
}
if (graphSurfaceMismatches > 40) errors.push(`Outras ${graphSurfaceMismatches - 40} divergências visuais foram omitidas.`);

const corridors = groupBy([...roads.values()], (road) => road.corridorId ?? road.id);
const endpointGroups = new Map<string, RoadData[]>();
for (const road of roads.values()) for (const point of [road.points[0], road.points.at(-1)!]) {
  const key = `${road.corridorId ?? road.id}|${point.nodeId}`;
  const values = endpointGroups.get(key) ?? [];
  values.push(road);
  endpointGroups.set(key, values);
}
let shortLaneOscillations = 0;
let abruptEndpointWidths = 0;
for (const corridor of corridors.values()) for (const road of corridor) {
  if (roadLength(road) > limits.shortOscillationMeters || road.highway.endsWith('_link') || road.junction === 'roundabout') continue;
  const neighbors = [road.points[0], road.points.at(-1)!].flatMap((point) => {
    const key = `${road.corridorId ?? road.id}|${point.nodeId}`;
    const values = (endpointGroups.get(key) ?? []).filter((candidate) => candidate.id !== road.id);
    return values.length === 1 ? values : [];
  });
  if (neighbors.length === 2
    && neighbors[0].oneway === road.oneway
    && neighbors[1].oneway === road.oneway
    && neighbors[0].lanes === neighbors[1].lanes
    && road.lanes !== neighbors[0].lanes) {
    shortLaneOscillations += 1;
    errors.push(`Oscilação curta ${neighbors[0].lanes} -> ${road.lanes} -> ${neighbors[1].lanes}: ${road.id}.`);
  }
}
for (const connected of endpointGroups.values()) {
  if (connected.length !== 2) continue;
  const [from, to] = connected;
  if (from.id === to.id
    || from.oneway !== to.oneway
    || from.layer !== to.layer
    || from.lanes !== to.lanes
    || from.highway.endsWith('_link')
    || to.highway.endsWith('_link')) continue;
  const fromWidth = endpointWidth(from, sharedEndpointAtStart(from, to));
  const toWidth = endpointWidth(to, sharedEndpointAtStart(to, from));
  if (Math.abs(fromWidth - toWidth) > limits.maximumEndpointWidthDeltaMeters) {
    abruptEndpointWidths += 1;
    errors.push(`Larguras não coincidem na continuidade ${from.id} -> ${to.id}.`);
  }
}

let disproportionateEntrances = 0;
for (const road of roads.values()) {
  if (!road.highway.endsWith('_link') && road.highway !== 'service') continue;
  const expected = Math.max(1, road.lanes) * 3.35;
  if (road.width / expected > limits.maximumEntranceWidthRatio) {
    disproportionateEntrances += 1;
    errors.push(`Entrada desproporcionalmente larga: ${road.id}.`);
  }
}

let disconnectedLanes = 0;
let oppositeLaneOverlaps = 0;
const lanesByRoad = groupBy([...lanes.values()], (lane) => lane.roadSegmentId);
for (const lane of lanes.values()) {
  if (lane.nextLaneIds.some((next) => !lanes.has(next))) errors.push(`Faixa ${lane.id} referencia conexão ausente.`);
  if (!lane.nextLaneIds.length) disconnectedLanes += 1;
}
if (disconnectedLanes / Math.max(1, lanes.size) > limits.maximumDisconnectedLaneShare) {
  errors.push(`${disconnectedLanes} faixas sem continuidade excedem o limite configurado.`);
}
for (const road of roads.values()) {
  if (road.oneway) continue;
  const roadLanes = lanesByRoad.get(road.id) ?? [];
  const forward = roadLanes.filter((lane) => lane.direction === 'forward');
  const backward = roadLanes.filter((lane) => lane.direction === 'backward');
  if (forward.some((forwardLane) => backward.some((backwardLane) => forwardLane.points.some((point, index) => {
    const opposite = backwardLane.points[backwardLane.points.length - 1 - index];
    return opposite
      && point.sourceNodeId === opposite.sourceNodeId
      && Math.hypot(point.x - opposite.x, point.y - opposite.y) < Math.max(1.6, road.width / road.lanes * 0.55);
  })))) {
    oppositeLaneOverlaps += 1;
    errors.push(`Sentidos opostos compartilham faixa na via ${road.id}.`);
  }
}

const router = new GraphRouter(graph);
const regionalCore = largestStrongComponent(graph);
const regionalAnchors = new Map(manifest.regions.map((region) => {
  const inside = graph.nodes.filter((node) => regionalCore.has(node.id) && pointInPolygon(node, region.polygon));
  const candidates = inside.length ? inside : graph.nodes.filter((node) => regionalCore.has(node.id));
  const anchor = candidates.reduce((best, node) =>
    Math.hypot(node.x - region.center.x, node.y - region.center.y) < Math.hypot(best.x - region.center.x, best.y - region.center.y) ? node : best
  );
  return [region.id, anchor] as const;
}));
const routeResults: string[] = [];
for (let index = 0; index < manifest.regions.length; index += 1) {
  const from = manifest.regions[index];
  const to = manifest.regions[(index + 1) % manifest.regions.length];
  const route = router.drivingRoute(regionalAnchors.get(from.id)!, regionalAnchors.get(to.id)!);
  const distance = router.distance(route);
  routeResults.push(`${from.name} → ${to.name}: ${(distance / 1_000).toFixed(1)} km`);
  if (route.length < 2 || distance < 300) errors.push(`Rota entre regiões indisponível: ${from.name} → ${to.name}.`);
}
const allServices = [...fuel, ...workshops, ...garages];
if (fuel.length < 7 || workshops.length < 5 || garages.length < 4) errors.push('Cobertura mínima de postos, oficinas e garagens não foi atingida.');
for (const priorityRegion of ['lago-sul', 'jardim-botanico']) for (const category of ['fuel', 'workshop', 'garage']) {
  if (!allServices.some((service) => service.regionId === priorityRegion && service.category === category)) {
    errors.push(`Cobertura ${category} ausente em ${priorityRegion}.`);
  }
}
for (const service of allServices) {
  if (!service.sourceUrl?.startsWith('https://www.openstreetmap.org/')) errors.push(`Fonte aberta ausente: ${service.id}.`);
  if (!service.regionId || !manifest.regions.some((region) => region.id === service.regionId)) errors.push(`Região inválida no serviço: ${service.id}.`);
  if (service.functionFictional && !service.functionNote) errors.push(`Adaptação fictícia sem declaração: ${service.id}.`);
  if (Math.hypot(service.entrance.x - service.stopPoint.x, service.entrance.y - service.stopPoint.y) > 80) errors.push(`Acesso ao lote excessivamente distante: ${service.id}.`);
  if (router.drivingRoute({ x: 0, y: 0 }, service.entrance).length < 2) errors.push(`Serviço sem acesso global: ${service.id}.`);
}
for (const taxi of taxiPoints) if (router.drivingRoute({ x: 0, y: 0 }, taxi.entrance).length < 2) errors.push(`Ponto de táxi sem acesso: ${taxi.id}.`);

const latKm = (manifest.bbox.north - manifest.bbox.south) * 111.195;
const lonKm = (manifest.bbox.east - manifest.bbox.west) * 111.195 * Math.cos(manifest.origin.lat * Math.PI / 180);
const areaKm2 = latKm * lonKm;
if (areaKm2 < 16) errors.push(`Área publicada insuficiente: ${areaKm2.toFixed(1)} km².`);
if (manifest.regions.length < 7) errors.push('Cobertura regional insuficiente.');
if (roads.size < 5_000 || graph.nodes.length < 20_000 || manifest.chunks.length < 20) errors.push('Malha 0.7 abaixo do volume mínimo.');

const report = `# Auditoria da malha viária — 0.8.6

- Área do bounding box: **${areaKm2.toFixed(1)} km²**;
- Chunks publicados: **${manifest.chunks.length}**;
- Vias canônicas: **${roads.size}**;
- Faixas detalhadas: **${lanes.size}**;
- Vias referenciadas no grafo global: **${graphRoadIds.size}**;
- Nós globais: **${graph.nodes.length}**;
- Nós no núcleo regional bidirecional: **${regionalCore.size}**;
- Arestas dirigidas: **${edgeCount}** (${connectorCount} conectores de junção);
- Oscilações curtas de faixas: **${shortLaneOscillations}**;
- Continuidades com largura abrupta: **${abruptEndpointWidths}**;
- Entradas desproporcionais: **${disproportionateEntrances}**;
- Conectores excessivamente abertos: **${oversizedConnectorSegments}**;
- Faixas sem próxima conexão: **${disconnectedLanes}**;
- Sobreposições entre sentidos opostos: **${oppositeLaneOverlaps}**;
- Divergências entre visual e grafo: **${graphSurfaceMismatches}**;
- Edifícios em LOD: **${buildings.size}**;
- Semáforos nos chunks: **${signalCount}**;
- Pontos de ônibus nos chunks: **${stopCount}**;
- Serviços publicados: **${fuel.length} postos, ${workshops.length} oficinas e ${garages.length} garagens**;
- Dados locais de chunks: **${(totalChunkBytes / 1_048_576).toFixed(1)} MB**, carregados por janela.

## Rotas entre regiões

${routeResults.map((route) => `- ${route}`).join('\n')}

## Alertas

${warnings.length ? warnings.map((warning) => `- ${warning}`).join('\n') : '- Nenhum alerta estrutural.'}

## Resultado

${errors.length ? `Falhou com ${errors.length} erro(s).` : 'Aprovada sem erros estruturais.'}
`;
await writeFile(path.join(docs, 'road-network-audit-0.8.6.md'), report);

if (errors.length) {
  console.error(errors.slice(0, 80).join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Mapa 0.8.6 validado: ${roads.size} vias, ${lanes.size} faixas, ${graph.nodes.length} nós, ${manifest.chunks.length} chunks, ${areaKm2.toFixed(1)} km².`);
}

function largestStrongComponent(graph: NavigationGraph) {
  const index = new Map(graph.nodes.map((node, nodeIndex) => [node.id, nodeIndex]));
  const forward = graph.nodes.map((node) => node.edges.flatMap((edge) => {
    const target = index.get(edge.to);
    return target === undefined ? [] : [target];
  }));
  const reverse = graph.nodes.map(() => [] as number[]);
  forward.forEach((targets, from) => targets.forEach((to) => reverse[to].push(from)));
  const seen = new Uint8Array(graph.nodes.length);
  const order: number[] = [];
  for (let start = 0; start < graph.nodes.length; start += 1) {
    if (seen[start]) continue;
    const stack: [number, number][] = [[start, 0]];
    seen[start] = 1;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const target = forward[frame[0]][frame[1]++];
      if (target !== undefined) {
        if (!seen[target]) { seen[target] = 1; stack.push([target, 0]); }
      } else {
        order.push(frame[0]);
        stack.pop();
      }
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
  return new Set(largest.map((nodeIndex) => graph.nodes[nodeIndex].id));
}

function roadLength(road: RoadData) {
  let total = 0;
  for (let index = 1; index < road.points.length; index += 1) {
    total += Math.hypot(road.points[index].x - road.points[index - 1].x, road.points[index].y - road.points[index - 1].y);
  }
  return total;
}

function sharedEndpointAtStart(road: RoadData, other: RoadData) {
  const otherEndpoints = new Set([other.points[0].nodeId, other.points.at(-1)!.nodeId]);
  return otherEndpoints.has(road.points[0].nodeId);
}

function endpointWidth(road: RoadData, atStart: boolean) {
  const profile = road.widthProfile;
  if (!profile?.length) return road.width;
  return atStart ? profile[0] : profile.at(-1)!;
}

function roadSurfaceDistance(point: { x: number; y: number }, road: RoadData) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 1; index < road.points.length; index += 1) {
    const from = road.points[index - 1];
    const to = road.points[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const squared = dx * dx + dy * dy;
    const progress = squared > 0 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared)) : 0;
    const closest = { x: from.x + dx * progress, y: from.y + dy * progress };
    const fromWidth = road.widthProfile?.[index - 1] ?? road.width;
    const toWidth = road.widthProfile?.[index] ?? road.width;
    const halfWidth = (fromWidth + (toWidth - fromWidth) * progress) / 2;
    best = Math.min(best, Math.hypot(point.x - closest.x, point.y - closest.y) - halfWidth);
  }
  return Math.max(0, best);
}

function unpackNavigationGraph(graph: NavigationGraph | PackedNavigationGraph): NavigationGraph {
  if (graph.kind !== 'packed-lane') return graph;
  return {
    kind: 'lane',
    version: graph.version,
    nodes: graph.nodes.map((packed, index) => ({
      id: index.toString(36),
      x: packed[0] / graph.precision,
      y: packed[1] / graph.precision,
      edges: packed[2].map((edge) => ({
        to: edge[0].toString(36),
        distance: edge[1] / graph.precision,
        roadId: graph.roads[edge[2]],
        highway: edge[3] >= 0 ? graph.highways[edge[3]] : undefined,
        connector: edge[4] === 1 || undefined
      }))
    }))
  };
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
