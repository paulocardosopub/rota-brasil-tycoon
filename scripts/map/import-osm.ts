import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type {
  BusStop, CityMapChunk, CityMapManifest, MapBuilding, MapRegion, MapSignal, RoadPoint
} from '../../src/types/game';
import { latLonToLocalMeters } from '../../src/map/projection/localMeters';
import {
  buildLaneGraph, canonicalizeRoads, chunkIdFor,
  type RawRoadSpec, type RoadOverride
} from '../../src/map/pipeline/RoadPipeline';

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
};

type OverpassResponse = { version: number; generator: string; osm3s?: unknown; elements: OsmElement[] };

const outputRoot = path.resolve('public/data/cities/brasilia');
const sourceRoot = path.resolve('data/map-sources/brasilia');
const overrideFile = path.resolve('data/map-overrides/brasilia/road-overrides.json');
const sourceFile = path.join(sourceRoot, 'osm-0.7.0.json.gz');
const origin = { lat: -15.7942, lon: -47.8822 };
const bbox = { south: -15.84, west: -47.95, north: -15.73, east: -47.83 };
const chunkSizeMeters = 800;
const mapVersion = 'brasilia-0.7.0';
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const allowedHighways = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
  'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential',
  'unclassified', 'service', 'living_street'
]);

async function download() {
  const merged = new Map<string, OsmElement>();
  const rows = 8;
  const columns = 8;
  const cacheRoot = path.join(sourceRoot, 'cache');
  await mkdir(cacheRoot, { recursive: true });
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const tile = {
      south: bbox.south + (bbox.north - bbox.south) * row / rows,
      north: bbox.south + (bbox.north - bbox.south) * (row + 1) / rows,
      west: bbox.west + (bbox.east - bbox.west) * column / columns,
      east: bbox.west + (bbox.east - bbox.west) * (column + 1) / columns
    };
    const cacheFile = path.join(cacheRoot, `tile-${row}-${column}.json.gz`);
    const tileData = await readCachedTile(cacheFile) ?? await fetchTile(tile, row, column);
    if (!(await readCachedTile(cacheFile))) await writeFile(cacheFile, await gzipAsync(Buffer.from(JSON.stringify(tileData))));
    for (const element of tileData.elements) mergeElement(merged, element);
    console.log(`Bloco geográfico ${row * columns + column + 1}/${rows * columns}: ${merged.size} elementos únicos.`);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return { version: 0.6, generator: 'Rota Brasil Tycoon tiled Overpass importer', elements: [...merged.values()] };
}

async function fetchTile(tile: typeof bbox, row: number, column: number) {
  return fetchTileRecursive(tile, row, column, 0);
}

async function fetchTileRecursive(tile: typeof bbox, row: number, column: number, depth: number): Promise<OverpassResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${tile.west},${tile.south},${tile.east},${tile.north}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/xml', 'User-Agent': 'RotaBrasilTycoonMapImporter/0.7 (local development)' },
        signal: AbortSignal.timeout(120_000)
      });
      if (response.status === 400 && depth < 3) {
        const detail = await response.text();
        console.warn(`Bloco ${row + 1}/${column + 1} denso; subdividindo (${detail.slice(0, 90)}).`);
        return mergeResponses(await Promise.all(splitTile(tile).map((part) => fetchTileRecursive(part, row, column, depth + 1))));
      }
      if (!response.ok) throw new Error(`OpenStreetMap API: ${response.status} ${response.statusText}`);
      return parseOsmXml(await response.text());
    } catch (error) {
      lastError = error;
      console.warn(`Bloco ${row + 1}/${column + 1}, tentativa ${attempt + 1}: ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 3_000 + attempt * 3_000));
    }
  }
  throw lastError;
}

function splitTile(tile: typeof bbox) {
  const midLat = (tile.south + tile.north) / 2;
  const midLon = (tile.west + tile.east) / 2;
  return [
    { south: tile.south, west: tile.west, north: midLat, east: midLon },
    { south: tile.south, west: midLon, north: midLat, east: tile.east },
    { south: midLat, west: tile.west, north: tile.north, east: midLon },
    { south: midLat, west: midLon, north: tile.north, east: tile.east }
  ];
}

function mergeResponses(responses: OverpassResponse[]): OverpassResponse {
  const elements = new Map<string, OsmElement>();
  for (const response of responses) for (const element of response.elements) mergeElement(elements, element);
  return { version: 0.6, generator: 'OpenStreetMap API tiled fallback', elements: [...elements.values()] };
}

function parseOsmXml(xml: string): OverpassResponse {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml) as {
    osm: { node?: unknown | unknown[]; way?: unknown | unknown[] };
  };
  const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
  const parseTags = (tag: unknown | unknown[] | undefined) => Object.fromEntries(
    asArray(tag as { k: string; v: string } | Array<{ k: string; v: string }> | undefined).map((item) => [String(item.k), String(item.v)])
  );
  const elements: OsmElement[] = [
    ...asArray(parsed.osm.node as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((node) => ({
      type: 'node' as const, id: Number(node.id), lat: Number(node.lat), lon: Number(node.lon), tags: parseTags(node.tag)
    })),
    ...asArray(parsed.osm.way as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((way) => ({
      type: 'way' as const, id: Number(way.id),
      nodes: asArray(way.nd as { ref: string } | Array<{ ref: string }> | undefined).map((item) => Number(item.ref)),
      tags: parseTags(way.tag)
    }))
  ];
  return { version: 0.6, generator: 'OpenStreetMap API', elements };
}

async function readCachedTile(filename: string) {
  try {
    return JSON.parse((await gunzipAsync(await readFile(filename))).toString('utf8')) as OverpassResponse;
  } catch {
    return null;
  }
}

function mergeElement(elements: Map<string, OsmElement>, incoming: OsmElement) {
  const key = `${incoming.type}:${incoming.id}`;
  const current = elements.get(key);
  if (!current) elements.set(key, incoming);
  else elements.set(key, {
    ...current,
    ...incoming,
    tags: { ...(current.tags ?? {}), ...(incoming.tags ?? {}) },
    nodes: incoming.nodes?.length ? incoming.nodes : current.nodes
  });
}

async function main() {
  const data = process.argv.includes('--from-source') ? await readSourceSnapshot() : await download();
  const importedAt = new Date().toISOString();
  const nodes = new Map<number, OsmElement>();
  for (const element of data.elements) if (element.type === 'node') nodes.set(element.id, element);

  const rawRoads: RawRoadSpec[] = data.elements.flatMap((element) => {
    if (element.type !== 'way' || !element.tags?.highway || !allowedHighways.has(element.tags.highway)) return [];
    const points = roadPoints(element, nodes);
    return points.length >= 2 ? [{ id: String(element.id), points, tags: element.tags }] : [];
  });
  const overrides = await readOverrides();
  const roads = canonicalizeRoads(rawRoads, overrides);
  const { lanes, graph } = buildLaneGraph(roads, chunkSizeMeters);

  const signals: MapSignal[] = data.elements.flatMap((element) => element.type === 'node'
    && element.tags?.highway === 'traffic_signals' && validCoordinate(element)
    ? [{ id: String(element.id), nodeId: String(element.id), ...latLonToLocalMeters(element.lat!, element.lon!, origin) }]
    : []);
  const seenStops = new Set<string>();
  const busStops: BusStop[] = data.elements.flatMap((element) => {
    if (element.type !== 'node' || !validCoordinate(element) || seenStops.has(String(element.id))) return [];
    if (element.tags?.highway !== 'bus_stop' && element.tags?.public_transport !== 'platform') return [];
    seenStops.add(String(element.id));
    return [{ id: String(element.id), name: element.tags?.name ?? 'Parada de ônibus', ...latLonToLocalMeters(element.lat!, element.lon!, origin) }];
  });
  const buildings: MapBuilding[] = data.elements.flatMap((element) => {
    if (element.type !== 'way' || !element.tags?.building) return [];
    const points = (element.nodes ?? []).flatMap((id) => {
      const node = nodes.get(id);
      return validCoordinate(node) ? [latLonToLocalMeters(node.lat!, node.lon!, origin)] : [];
    });
    return points.length >= 3 ? [{
      id: String(element.id),
      levels: Math.max(1, Math.min(30, Math.round(numberTag(element.tags['building:levels']) ?? 2))),
      points
    }] : [];
  });

  for (const road of roads) road.chunkIds = [...new Set(road.points.map((point) => chunkIdFor(point, chunkSizeMeters)))];
  const regions = buildRegions();
  const chunkIds = new Set<string>();
  for (const road of roads) for (const id of road.chunkIds ?? []) chunkIds.add(id);
  for (const building of buildings) chunkIds.add(chunkIdFor(centroid(building.points), chunkSizeMeters));
  const chunkEntries: CityMapManifest['chunks'] = [];

  await Promise.all([mkdir(path.join(outputRoot, 'chunks'), { recursive: true }), mkdir(sourceRoot, { recursive: true })]);
  for (const id of [...chunkIds].sort(chunkSort)) {
    const bounds = chunkBounds(id, chunkSizeMeters);
    const region = nearestRegion({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, regions);
    const chunkRoads = roads.filter((road) => road.chunkIds?.includes(id));
    const chunkLanes = lanes.filter((lane) => lane.chunkIds.includes(id));
    const chunk: CityMapChunk = {
      id,
      regionId: region.id,
      roads: chunkRoads,
      lanes: chunkLanes,
      signals: signals.filter((signal) => chunkIdFor(signal, chunkSizeMeters) === id),
      busStops: busStops.filter((stop) => chunkIdFor(stop, chunkSizeMeters) === id),
      buildings: buildings.filter((building) => chunkIdFor(centroid(building.points), chunkSizeMeters) === id).slice(0, 180)
    };
    const entry = {
      id, regionId: region.id, bounds, adjacent: adjacentChunkIds(id), file: `chunks/${id}.json`,
      roadCount: chunk.roads.length, buildingCount: chunk.buildings.length, laneCount: chunk.lanes.length,
      capacity: 96, spawnBudget: 72, playerBudget: 8, fleetBudget: 16, npcBudget: 72
    };
    chunkEntries.push(entry);
    await writeJson(path.join(outputRoot, entry.file), chunk, false);
  }

  const metadata = {
    city: 'Brasília',
    area: 'Plano Piloto, Sudoeste, Cruzeiro, Noroeste e Vila Planalto',
    origin, bbox, importedAt,
    source: 'OpenStreetMap',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    license: 'Open Database License (ODbL) 1.0',
    attribution: '© OpenStreetMap contributors',
    coordinateSystem: 'Coordenadas locais em metros, projeção equiretangular centrada na origem declarada.'
  };
  const manifest: CityMapManifest = {
    mapVersion, city: 'Brasília', origin, bbox, chunkSizeMeters,
    graphFile: 'lane-graph.json.gz', signalFile: 'traffic-signals.json', serviceBase: 'central/services',
    regions, chunks: chunkEntries
  };
  const rawCompressed = await gzipAsync(Buffer.from(JSON.stringify(data)));
  const graphCompressed = await gzipAsync(Buffer.from(JSON.stringify(graph)), { level: 9 });
  await Promise.all([
    writeJson(path.join(outputRoot, 'manifest.json'), manifest),
    writeJson(path.join(outputRoot, 'metadata.json'), metadata),
    writeFile(path.join(outputRoot, 'lane-graph.json.gz'), graphCompressed),
    writeJson(path.join(outputRoot, 'traffic-signals.json'), signals),
    writeFile(path.join(sourceRoot, 'osm-0.7.0.json.gz'), rawCompressed),
    writeJson(path.join(sourceRoot, 'source-metadata.json'), {
      source: 'OpenStreetMap', license: 'ODbL 1.0', importedAt, bbox,
      overpassQueryVersion: '0.7.0', modifications: ['filtro de vias dirigíveis', 'inferência canônica de corredores', 'grafo por faixa', 'chunks de 800 m'],
      overrideFile: 'data/map-overrides/brasilia/road-overrides.json'
    })
  ]);
  await rm(path.join(outputRoot, 'lane-graph.json'), { force: true });
  console.log(`Mapa ${mapVersion}: ${roads.length} vias, ${lanes.length} faixas, ${graph.nodes.length} nós, ${chunkEntries.length} chunks, ${buildings.length} prédios.`);
}

async function readSourceSnapshot() {
  const compressed = await readFile(sourceFile);
  return JSON.parse((await gunzipAsync(compressed)).toString('utf8')) as OverpassResponse;
}

function roadPoints(way: OsmElement, nodes: Map<number, OsmElement>): RoadPoint[] {
  return (way.nodes ?? []).flatMap((id) => {
    const node = nodes.get(id);
    if (!validCoordinate(node)) return [];
    return [{ ...latLonToLocalMeters(node.lat!, node.lon!, origin), lat: node.lat!, lon: node.lon!, nodeId: String(id) }];
  });
}

async function readOverrides(): Promise<RoadOverride[]> {
  try {
    const parsed = JSON.parse(await readFile(overrideFile, 'utf8')) as { overrides?: RoadOverride[] };
    return parsed.overrides ?? [];
  } catch {
    return [];
  }
}

function buildRegions(): MapRegion[] {
  const definitions = [
    ['asa-norte', 'Asa Norte', -15.755, -47.885, 2_700, 2_900],
    ['asa-sul', 'Asa Sul', -15.815, -47.900, 2_900, 3_200],
    ['centro', 'Setores Centrais', -15.794, -47.882, 2_000, 2_000],
    ['sudoeste', 'Sudoeste', -15.797, -47.925, 1_800, 1_800],
    ['cruzeiro', 'Cruzeiro', -15.790, -47.938, 1_700, 1_800],
    ['noroeste', 'Noroeste', -15.750, -47.910, 2_100, 2_100],
    ['vila-planalto', 'Vila Planalto', -15.790, -47.850, 1_900, 2_000],
    ['unb', 'Universidade de Brasília', -15.765, -47.870, 2_000, 2_000]
  ] as const;
  return definitions.map(([id, name, lat, lon, width, height]) => {
    const center = latLonToLocalMeters(lat, lon, origin);
    return { id, name, center, bounds: { minX: center.x - width / 2, minY: center.y - height / 2, maxX: center.x + width / 2, maxY: center.y + height / 2 } };
  });
}

function nearestRegion(point: { x: number; y: number }, regions: MapRegion[]) {
  return regions.reduce((best, region) => distance(point, region.center) < distance(point, best.center) ? region : best);
}

function chunkBounds(id: string, size: number) {
  const [x, y] = id.split('_').map(Number);
  return { minX: x * size, minY: y * size, maxX: (x + 1) * size, maxY: (y + 1) * size };
}

function adjacentChunkIds(id: string) {
  const [x, y] = id.split('_').map(Number);
  const ids: string[] = [];
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) if (dx || dy) ids.push(`${x + dx}_${y + dy}`);
  return ids;
}

function centroid(points: Array<{ x: number; y: number }>) {
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function validCoordinate(element: OsmElement | undefined): element is OsmElement & { lat: number; lon: number } {
  return Boolean(element && Number.isFinite(element.lat) && Number.isFinite(element.lon));
}

function numberTag(value: string | undefined) {
  const parsed = Number(value?.replace(',', '.').match(/[\d.]+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function chunkSort(a: string, b: string) {
  const [ax, ay] = a.split('_').map(Number);
  const [bx, by] = b.split('_').map(Number);
  return ax - bx || ay - by;
}

async function writeJson(filename: string, value: unknown, pretty = true) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`);
}

await main();
