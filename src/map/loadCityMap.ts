import type {
  CityMapChunk, CityMapData, CityMapManifest, MapMetadata, MapServiceLocation,
  MapSignal, NavigationGraph, Point, TaxiPoint
} from '../types/game';

const ROOT = 'data/cities/brasilia';

async function loadJson<T>(filename: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${ROOT}/${filename}`);
  if (!response.ok) throw new Error(`Falha ao carregar ${filename}: ${response.status}`);
  return response.json() as Promise<T>;
}

async function loadGzipJson<T>(filename: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}${ROOT}/${filename}`);
  if (!response.ok) throw new Error(`Falha ao carregar ${filename}: ${response.status}`);
  if (response.headers.get('content-encoding')?.includes('gzip')) {
    return JSON.parse(await response.text()) as T;
  }
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não oferece descompactação do mapa.');
  const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) throw new Error('O grafo do mapa não pôde ser aberto.');
  return JSON.parse(await new Response(stream).text()) as T;
}

export class CityMapStream {
  private readonly cache = new Map<string, CityMapChunk>();
  private readonly entries = new Map<string, CityMapManifest['chunks'][number]>();
  private currentIds: string[] = [];
  private centerId: string | null = null;

  private constructor(
    readonly manifest: CityMapManifest,
    readonly metadata: MapMetadata,
    readonly graph: NavigationGraph,
    readonly globalSignals: MapSignal[],
    readonly services: MapServiceLocation[],
    readonly taxiPoints: TaxiPoint[]
  ) {
    for (const entry of manifest.chunks) this.entries.set(entry.id, entry);
  }

  static async create() {
    const manifest = await loadJson<CityMapManifest>('manifest.json');
    const [metadata, graph, globalSignals, fuelStations, workshops, garages, taxiPoints] = await Promise.all([
      loadJson<MapMetadata>('metadata.json'),
      loadGzipJson<NavigationGraph>(manifest.graphFile),
      loadJson<MapSignal[]>(manifest.signalFile),
      loadJson<MapServiceLocation[]>(`${manifest.serviceBase}/fuel-stations.json`),
      loadJson<MapServiceLocation[]>(`${manifest.serviceBase}/workshops.json`),
      loadJson<MapServiceLocation[]>(`${manifest.serviceBase}/garages.json`),
      loadJson<TaxiPoint[]>(`${manifest.serviceBase}/taxi-points.json`)
    ]);
    return new CityMapStream(manifest, metadata, graph, globalSignals, [...fuelStations, ...workshops, ...garages], taxiPoints);
  }

  async windowAt(position: Point): Promise<CityMapData> {
    const center = this.entryAt(position);
    const wanted = [center.id, ...center.adjacent].filter((id) => this.entries.has(id));
    const chunks = await Promise.all(wanted.map((id) => this.loadChunk(id)));
    this.currentIds = wanted;
    this.centerId = center.id;
    this.trimCache(new Set(wanted));
    return {
      metadata: this.metadata,
      roads: uniqueBy(chunks.flatMap((chunk) => chunk.roads), (road) => road.id),
      lanes: uniqueBy(chunks.flatMap((chunk) => chunk.lanes), (lane) => lane.id),
      graph: this.graph,
      signals: uniqueBy(chunks.flatMap((chunk) => chunk.signals), (signal) => signal.id),
      busStops: uniqueBy(chunks.flatMap((chunk) => chunk.busStops), (stop) => stop.id),
      buildings: uniqueBy(chunks.flatMap((chunk) => chunk.buildings), (building) => building.id),
      services: this.services,
      taxiPoints: this.taxiPoints,
      manifest: this.manifest,
      loadedChunkIds: [...wanted]
    };
  }

  needsWindow(position: Point) {
    return this.entryAt(position).id !== this.centerId;
  }

  location(position: Point) {
    const entry = this.entryAt(position);
    return {
      chunkId: entry.id,
      region: this.manifest.regions.find((region) => region.id === entry.regionId)
        ?? nearest(position, this.manifest.regions, (region) => region.center)
    };
  }

  private entryAt(position: Point) {
    const id = `${Math.floor(position.x / this.manifest.chunkSizeMeters)}_${Math.floor(position.y / this.manifest.chunkSizeMeters)}`;
    return this.entries.get(id) ?? nearest(position, this.manifest.chunks, (entry) => ({
      x: (entry.bounds.minX + entry.bounds.maxX) / 2,
      y: (entry.bounds.minY + entry.bounds.maxY) / 2
    }));
  }

  private async loadChunk(id: string) {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Chunk inexistente: ${id}`);
    const chunk = await loadJson<CityMapChunk>(entry.file);
    this.cache.set(id, chunk);
    return chunk;
  }

  private trimCache(active: Set<string>) {
    if (this.cache.size <= 14) return;
    for (const id of this.cache.keys()) {
      if (!active.has(id)) this.cache.delete(id);
      if (this.cache.size <= 14) break;
    }
  }
}

export async function loadCityMap(position: Point = { x: 0, y: 0 }): Promise<CityMapData> {
  const stream = await CityMapStream.create();
  return stream.windowAt(position);
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFor(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nearest<T>(position: Point, values: T[], pointFor: (value: T) => Point) {
  if (!values.length) throw new Error('Manifesto do mapa não possui chunks ou regiões.');
  return values.reduce((best, value) => distance(position, pointFor(value)) < distance(position, pointFor(best)) ? value : best);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
