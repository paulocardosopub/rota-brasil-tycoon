import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GraphNode, RoadData } from '../../src/types/game';

const nonDrivableHighways = new Set(['pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track']);

const outputDir = path.resolve('public/data/cities/brasilia/central');
const roads = JSON.parse(await readFile(path.join(outputDir, 'roads.json'), 'utf8')) as RoadData[];
const nodes = new Map<string, GraphNode>();

for (const road of roads) {
  if (nonDrivableHighways.has(road.highway)) continue;
  for (const point of road.points) {
    nodes.set(point.nodeId, nodes.get(point.nodeId) ?? { id: point.nodeId, x: point.x, y: point.y, edges: [] });
  }
  for (let index = 1; index < road.points.length; index += 1) {
    const from = road.points[index - 1];
    const to = road.points[index];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    nodes.get(from.nodeId)!.edges.push({ to: to.nodeId, distance, roadId: road.id });
    if (!road.oneway) nodes.get(to.nodeId)!.edges.push({ to: from.nodeId, distance, roadId: road.id });
  }
}

const graphNodes = [...nodes.values()];
await writeFile(path.join(outputDir, 'navigation-graph.json'), `${JSON.stringify({ nodes: graphNodes })}\n`);
console.log(`Grafo criado com ${graphNodes.length} nós e ${graphNodes.reduce((sum, node) => sum + node.edges.length, 0)} arestas direcionadas.`);
