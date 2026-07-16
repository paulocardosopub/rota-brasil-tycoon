import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BusStop, GraphNode, MapBuilding, MapMetadata, MapServiceLocation, MapSignal, Point, RoadData, TaxiPoint } from '../../src/types/game';

const dataDir = path.resolve('public/data/cities/brasilia/central');
const read = async <T>(name: string) => JSON.parse(await readFile(path.join(dataDir, name), 'utf8')) as T;
const [metadata, roads, graph, signals, stops, buildings, fuel, workshops, garages, taxiPoints, accessNodes, sourceMetadata] = await Promise.all([
  read<MapMetadata>('metadata.json'), read<RoadData[]>('roads.json'), read<{ nodes: GraphNode[] }>('navigation-graph.json'),
  read<MapSignal[]>('traffic-signals.json'), read<BusStop[]>('bus-stops.json'), read<MapBuilding[]>('buildings.json'),
  read<MapServiceLocation[]>('services/fuel-stations.json'), read<MapServiceLocation[]>('services/workshops.json'),
  read<MapServiceLocation[]>('services/garages.json'),
  read<TaxiPoint[]>('services/taxi-points.json'),
  read<{ serviceId: string; entranceGraphNodeId: string; exitGraphNodeId: string; accessWayId: string }[]>('services/service-access-nodes.json'),
  read<{ source: string; license: string; attribution: string; validatedAt: string }>('services/source-metadata.json')
]);

const errors: string[] = [];
if (metadata.license !== 'Open Database License (ODbL) 1.0') errors.push('Licença ODbL ausente.');
if (roads.length < 20) errors.push('Poucas vias para o recorte jogável.');
if (graph.nodes.length < 30) errors.push('Grafo de navegação insuficiente.');
if (signals.length < 1) errors.push('Nenhum semáforo disponível para a demonstração.');
if (stops.length < 8) errors.push('São necessários ao menos oito pontos de ônibus no recorte.');
if (roads.some((road) => road.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) errors.push('Há coordenadas inválidas.');
if (buildings.length === 0) errors.push('Nenhum prédio processado.');

const services = [...fuel, ...workshops, ...garages];
const ids = new Set<string>();
const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const buildingById = new Map(buildings.map((building) => [building.id, building]));
if (fuel.length < 2) errors.push('São necessários dois postos reais dentro do recorte.');
if (workshops.length < 1 || garages.length < 1) errors.push('Oficina ou garagem georreferenciada ausente.');
if (sourceMetadata.source !== 'OpenStreetMap' || !sourceMetadata.attribution.includes('OpenStreetMap') || !sourceMetadata.license.includes('ODbL')) errors.push('Fonte/licença/atribuição dos serviços incompleta.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceMetadata.validatedAt)) errors.push('Data de validação dos serviços inválida.');

for (const service of services) {
  if (ids.has(service.id)) errors.push(`ID de serviço duplicado: ${service.id}.`);
  ids.add(service.id);
  if (!service.sourceId || !service.buildingId || !service.realName || !service.address) errors.push(`${service.id}: referência real incompleta.`);
  if (service.lat < metadata.bbox.south || service.lat > metadata.bbox.north || service.lon < metadata.bbox.west || service.lon > metadata.bbox.east) errors.push(`${service.id}: fora do recorte carregado.`);
  const building = buildingById.get(service.buildingId);
  if (!building) errors.push(`${service.id}: prédio ${service.buildingId} não existe no mapa importado.`);
  const entranceNode = nodeById.get(service.entrance.graphNodeId);
  if (!entranceNode) errors.push(`${service.id}: entrada não ligada ao grafo.`);
  else {
    if (entranceNode.edges.length === 0) errors.push(`${service.id}: entrada sem rota de saída.`);
    if (!graph.nodes.some((node) => node.edges.some((edge) => edge.to === entranceNode.id))) errors.push(`${service.id}: entrada sem rota de chegada.`);
    if (distance(entranceNode, service.entrance) > 1) errors.push(`${service.id}: coordenada da entrada diverge do nó do grafo.`);
  }
  const access = accessNodes.find((item) => item.serviceId === service.id);
  if (!access || access.entranceGraphNodeId !== service.entrance.graphNodeId || !access.accessWayId) errors.push(`${service.id}: metadado de acesso incompleto.`);
  const accessLength = distance(service.entrance, service.stopPoint);
  if (accessLength < 5 || accessLength > 55) errors.push(`${service.id}: ponto de parada fora do envelope real do lote (${accessLength.toFixed(1)} m).`);
  if (graph.nodes.some((node) => distance(node, service.stopPoint) < 3)) errors.push(`${service.id}: ponto de parada indevidamente no centro da via.`);
  for (const candidate of buildings) {
    if (candidate.id === service.buildingId) continue;
    if (segmentIntersectsPolygon(service.entrance, service.stopPoint, candidate.points)) {
      errors.push(`${service.id}: acesso cruza o prédio ${candidate.id}.`); break;
    }
  }
}

if (taxiPoints.length < 3) errors.push('São necessários ao menos três pontos de táxi reais e roteáveis.');
for (const taxiPoint of taxiPoints) {
  if (!taxiPoint.official || taxiPoint.sourceType !== 'node' || !/^\d+$/.test(taxiPoint.sourceId)) errors.push(`${taxiPoint.id}: fonte OSM inválida.`);
  if (!taxiPoint.sourceUrl.includes(`/node/${taxiPoint.sourceId}`)) errors.push(`${taxiPoint.id}: URL não corresponde ao nó OSM.`);
  if (!taxiPoint.realName || !taxiPoint.accessRoad || !taxiPoint.sideOfRoad || !taxiPoint.queueArea || !taxiPoint.validatedAt) errors.push(`${taxiPoint.id}: documentação operacional incompleta.`);
  if (taxiPoint.lat < metadata.bbox.south || taxiPoint.lat > metadata.bbox.north || taxiPoint.lon < metadata.bbox.west || taxiPoint.lon > metadata.bbox.east) errors.push(`${taxiPoint.id}: fora do recorte.`);
  const entrance = nodeById.get(taxiPoint.entrance.graphNodeId);
  const exit = nodeById.get(taxiPoint.exit.graphNodeId);
  if (!entrance || !exit) errors.push(`${taxiPoint.id}: entrada ou saída sem ligação ao grafo.`);
  if (entrance && distance(entrance, taxiPoint.entrance) > 1) errors.push(`${taxiPoint.id}: entrada diverge do nó roteável.`);
  if (taxiPoint.gameplayCapacity < 1 || taxiPoint.gameplayCapacity > 4) errors.push(`${taxiPoint.id}: capacidade de gameplay fora do limite seguro.`);
}

if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Mapa válido: ${roads.length} vias, ${graph.nodes.length} nós, ${signals.length} semáforos, ${stops.length} paradas, ${buildings.length} prédios e ${services.length} serviços reais/adaptados validados.`);

function distance(a: Point, b: Point) { return Math.hypot(a.x - b.x, a.y - b.y); }
function segmentIntersectsPolygon(a: Point, b: Point, polygon: Point[]) {
  for (let index = 0; index < polygon.length - 1; index += 1) if (segmentsIntersect(a, b, polygon[index], polygon[index + 1])) return true;
  return false;
}
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = cross(a, b, c); const abD = cross(a, b, d); const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return abC * abD < -0.001 && cdA * cdB < -0.001;
}
