import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BusStop, GraphNode, MapBuilding, MapMetadata, MapSignal, RoadData } from '../../src/types/game';

const dataDir = path.resolve('public/data/cities/brasilia/central');
const read = async <T>(name: string) => JSON.parse(await readFile(path.join(dataDir, name), 'utf8')) as T;
const [metadata, roads, graph, signals, stops, buildings] = await Promise.all([
  read<MapMetadata>('metadata.json'),
  read<RoadData[]>('roads.json'),
  read<{ nodes: GraphNode[] }>('navigation-graph.json'),
  read<MapSignal[]>('traffic-signals.json'),
  read<BusStop[]>('bus-stops.json'),
  read<MapBuilding[]>('buildings.json')
]);

const errors: string[] = [];
if (metadata.license !== 'Open Database License (ODbL) 1.0') errors.push('Licença ODbL ausente.');
if (roads.length < 20) errors.push('Poucas vias para o recorte jogável.');
if (graph.nodes.length < 30) errors.push('Grafo de navegação insuficiente.');
if (signals.length < 1) errors.push('Nenhum semáforo disponível para a demonstração.');
if (stops.length < 8) errors.push('São necessários ao menos oito pontos de ônibus no recorte.');
if (roads.some((road) => road.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) errors.push('Há coordenadas inválidas.');
if (buildings.length === 0) errors.push('Nenhum prédio processado.');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Mapa válido: ${roads.length} vias, ${graph.nodes.length} nós, ${signals.length} semáforos, ${stops.length} paradas e ${buildings.length} prédios.`);
}
