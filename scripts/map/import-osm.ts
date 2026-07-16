import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { latLonToLocalMeters } from '../../src/map/projection/localMeters';

type OsmElement = {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
};

const outputDir = path.resolve('public/data/cities/brasilia/central');
const origin = { lat: -15.7942, lon: -47.8822 };
const bbox = { south: -15.8032, west: -47.89155, north: -15.7852, east: -47.87285 };
async function download() {
  const mapUrl = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const response = await fetch(mapUrl, {
    headers: { Accept: 'application/xml', 'User-Agent': 'RotaBrasilTycoonMapImporter/0.1 (local development)' },
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`OSM API: ${response.status} ${response.statusText}`);
  const xml = await response.text();
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml) as {
    osm: { node?: unknown | unknown[]; way?: unknown | unknown[] };
  };
  const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
  const parseTags = (tag: unknown | unknown[] | undefined) => Object.fromEntries(
    asArray(tag as { k: string; v: string } | { k: string; v: string }[] | undefined).map((item) => [String(item.k), String(item.v)])
  );
  const elements: OsmElement[] = [
    ...asArray(parsed.osm.node as Record<string, unknown> | Record<string, unknown>[] | undefined).map((node) => ({
      type: 'node' as const,
      id: Number(node.id),
      lat: Number(node.lat),
      lon: Number(node.lon),
      tags: parseTags(node.tag)
    })),
    ...asArray(parsed.osm.way as Record<string, unknown> | Record<string, unknown>[] | undefined).map((way) => ({
      type: 'way' as const,
      id: Number(way.id),
      nodes: asArray(way.nd as { ref: string } | { ref: string }[] | undefined).map((item) => Number(item.ref)),
      tags: parseTags(way.tag)
    }))
  ];
  return { elements };
}

function numberTag(value: string | undefined, fallback: number) {
  const match = value?.match(/[\d.]+/);
  return match ? Number(match[0]) : fallback;
}

const laneDefaults: Record<string, number> = {
  motorway: 3,
  trunk: 3,
  primary: 2,
  secondary: 2,
  tertiary: 2,
  residential: 1,
  service: 1,
  unclassified: 1
};

async function main() {
  const data = await download();
  const nodes = new Map<number, OsmElement>();
  for (const element of data.elements) if (element.type === 'node') nodes.set(element.id, element);

  const roads = data.elements
    .filter((element) => element.type === 'way' && element.tags?.highway)
    .map((way) => {
      const highway = way.tags!.highway;
      const lanes = Math.max(1, Math.round(numberTag(way.tags!.lanes, laneDefaults[highway] ?? 1)));
      const width = numberTag(way.tags!.width, lanes * 3.25 + (lanes > 1 ? 1 : 0));
      const points = (way.nodes ?? []).flatMap((id) => {
        const node = nodes.get(id);
        if (node?.lat === undefined || node.lon === undefined) return [];
        const local = latLonToLocalMeters(node.lat, node.lon, origin);
        return [{ ...local, lat: node.lat, lon: node.lon, nodeId: String(id) }];
      });
      return {
        id: String(way.id),
        name: way.tags!.name ?? `Via ${way.id}`,
        highway,
        oneway: ['yes', '1', 'true'].includes(way.tags!.oneway ?? '') || highway === 'motorway',
        lanes,
        width,
        points
      };
    })
    .filter((road) => road.points.length >= 2);

  const buildings = data.elements
    .filter((element) => element.type === 'way' && element.tags?.building)
    .slice(0, 800)
    .map((way) => ({
      id: String(way.id),
      levels: Math.max(1, Math.min(20, Math.round(numberTag(way.tags?.['building:levels'], 2)))),
      points: (way.nodes ?? []).flatMap((id) => {
        const node = nodes.get(id);
        return node?.lat !== undefined && node.lon !== undefined ? [latLonToLocalMeters(node.lat, node.lon, origin)] : [];
      })
    }))
    .filter((building) => building.points.length >= 3);

  const signals = data.elements
    .filter((element) => element.type === 'node' && element.tags?.highway === 'traffic_signals')
    .flatMap((node) => node.lat !== undefined && node.lon !== undefined ? [{ id: String(node.id), nodeId: String(node.id), ...latLonToLocalMeters(node.lat, node.lon, origin) }] : []);

  const seenStops = new Set<string>();
  const busStops = data.elements
    .filter((element) => element.type === 'node' && (element.tags?.highway === 'bus_stop' || element.tags?.public_transport === 'platform'))
    .flatMap((node) => {
      if (node.lat === undefined || node.lon === undefined || seenStops.has(String(node.id))) return [];
      seenStops.add(String(node.id));
      return [{ id: String(node.id), name: node.tags?.name ?? 'Parada de ônibus', ...latLonToLocalMeters(node.lat, node.lon, origin) }];
    });

  const chunks: Record<string, { roadIds: string[]; buildingIds: string[] }> = {};
  const addChunk = (x: number, y: number, kind: 'roadIds' | 'buildingIds', id: string) => {
    const key = `${Math.floor(x / 400)},${Math.floor(y / 400)}`;
    chunks[key] ??= { roadIds: [], buildingIds: [] };
    if (!chunks[key][kind].includes(id)) chunks[key][kind].push(id);
  };
  for (const road of roads) for (const point of road.points) addChunk(point.x, point.y, 'roadIds', road.id);
  for (const building of buildings) for (const point of building.points) addChunk(point.x, point.y, 'buildingIds', building.id);

  const metadata = {
    city: 'Brasília',
    area: 'Rodoviária do Plano Piloto e Eixo Monumental',
    origin,
    bbox,
    importedAt: new Date().toISOString(),
    source: 'OpenStreetMap',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    license: 'Open Database License (ODbL) 1.0',
    attribution: '© OpenStreetMap contributors',
    coordinateSystem: 'Coordenadas locais em metros, projeção equiretangular centrada na origem declarada.'
  };

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`),
    writeFile(path.join(outputDir, 'roads.json'), `${JSON.stringify(roads)}\n`),
    writeFile(path.join(outputDir, 'traffic-signals.json'), `${JSON.stringify(signals, null, 2)}\n`),
    writeFile(path.join(outputDir, 'bus-stops.json'), `${JSON.stringify(busStops, null, 2)}\n`),
    writeFile(path.join(outputDir, 'buildings.json'), `${JSON.stringify(buildings)}\n`),
    writeFile(path.join(outputDir, 'chunks.json'), `${JSON.stringify(chunks)}\n`)
  ]);
  console.log(`Importados ${roads.length} trechos, ${buildings.length} prédios, ${signals.length} semáforos e ${busStops.length} paradas.`);
}

await main();
