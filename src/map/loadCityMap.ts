import type {
  CityMapChunk, CityMapData, CityMapManifest, MapMetadata, MapServiceLocation,
  NavigationGraph, Point, TaxiPoint
} from '../types/game';
import { buildLaneGraph, type PackedNavigationGraph } from './pipeline/RoadPipeline';

const ROOT = 'data/cities/brasilia';
const CACHE_NAME = 'brasilia-map-0.8.6';
const MANIFEST_CACHE_NAME = 'brasilia-manifest-0.8.6';
const LAZY_CACHE_NAME = 'rota-lazy-0.8.6';
const MAX_PERSISTED_CHUNKS = 96;
const MAX_MEMORY_CHUNKS = 32;

type StreamWindowOptions = {
  heading?: number;
  speedMps?: number;
  radiusMeters?: number;
  signal?: AbortSignal;
};

async function loadResponse(filename: string, signal?: AbortSignal, persistent = true, revision?: string, refresh = false) {
  const baseUrl = `${import.meta.env.BASE_URL}${ROOT}/${filename}`;
  const url = revision ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}revision=${encodeURIComponent(revision)}` : baseUrl;
  if (!persistent || typeof caches === 'undefined') {
    const response = await fetch(url, { signal, cache: refresh || !persistent ? 'no-store' : 'default' });
    if (!response.ok) throw new Error(`Falha ao carregar ${filename}: ${response.status}`);
    return response;
  }
  const cache = await caches.open(CACHE_NAME);
  const cached = refresh ? undefined : await cache.match(url);
  if (cached) return cached;
  const response = await fetch(url, { signal, cache: refresh ? 'reload' : 'default' });
  if (!response.ok) throw new Error(`Falha ao carregar ${filename}: ${response.status}`);
  if (!signal?.aborted) {
    await cache.put(url, response.clone());
    if (filename.startsWith('chunks/')) void trimPersistentCache(cache);
  }
  return response;
}

async function loadJson<T>(filename: string, signal?: AbortSignal, persistent = true, revision?: string, refresh = false): Promise<T> {
  return loadResponse(filename, signal, persistent, revision, refresh).then((response) => response.json() as Promise<T>);
}

async function loadGzipJson<T>(filename: string, signal?: AbortSignal, revision?: string): Promise<T> {
  const response = await loadResponse(filename, signal, true, revision);
  if (response.headers.get('content-encoding')?.includes('gzip')) {
    return JSON.parse(await response.text()) as T;
  }
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador nÃ£o oferece descompactaÃ§Ã£o do mapa.');
  const stream = response.body?.pipeThrough(new DecompressionStream('gzip'));
  if (!stream) throw new Error('O grafo do mapa nÃ£o pÃ´de ser aberto.');
  return JSON.parse(await new Response(stream).text()) as T;
}

async function purgeLegacyMapCaches() {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) =>
      (name.startsWith('brasilia-map-') && name !== CACHE_NAME)
      || (name.startsWith('brasilia-manifest-') && name !== MANIFEST_CACHE_NAME)
      || (name.startsWith('rota-lazy-') && name !== LAZY_CACHE_NAME))
    .map((name) => caches.delete(name)));
}

async function trimPersistentCache(cache: Cache) {
  const chunkRequests = (await cache.keys()).filter((request) => request.url.includes('/chunks/'));
  const overflow = chunkRequests.length - MAX_PERSISTED_CHUNKS;
  if (overflow > 0) await Promise.all(chunkRequests.slice(0, overflow).map((request) => cache.delete(request)));
}

export class CityMapStream {
  private readonly memory = new Map<string, CityMapChunk>();
  private readonly inflight = new Map<string, Promise<CityMapChunk>>();
  private readonly entries = new Map<string, CityMapManifest['chunks'][number]>();
  private readonly protectedIds = new Set<string>();
  private readonly prefetchQueue: string[] = [];
  private currentIds: string[] = [];
  private centerId: string | null = null;
  private prefetchActive = 0;
  private globalGraph?: NavigationGraph;
  private globalGraphPromise?: Promise<NavigationGraph>;
  private graphRefreshPending = false;

  private constructor(
    readonly manifest: CityMapManifest,
    readonly metadata: MapMetadata,
    readonly services: MapServiceLocation[],
    readonly taxiPoints: TaxiPoint[],
    readonly roadNames: Record<string, string>
  ) {
    for (const entry of manifest.chunks) this.entries.set(entry.id, entry);
  }

  static async create() {
    await purgeLegacyMapCaches();
    const manifest = await loadJson<CityMapManifest>('manifest.json?v=0.8.6', undefined, false);
    const revision = manifest.dataRevision ?? manifest.mapVersion;
    const [metadata, fuelStations, workshops, garages, taxiPoints, roadNames] = await Promise.all([
      loadJson<MapMetadata>('metadata.json', undefined, true, revision),
      loadJson<MapServiceLocation[]>(`${manifest.serviceBase}/fuel-stations.json`, undefined, true, revision),
      loadJson<MapServiceLocation[]>(`${manifest.serviceBase}/workshops.json`, undefined, true, revision),
      loadJson<MapServiceLocation[]>(`${manifest.serviceBase}/garages.json`, undefined, true, revision),
      loadJson<TaxiPoint[]>(`${manifest.serviceBase}/taxi-points.json`, undefined, true, revision),
      loadJson<Record<string, string>>(manifest.addressFile ?? 'road-addresses.json', undefined, true, revision)
    ]);
    return new CityMapStream(manifest, metadata, [...fuelStations, ...workshops, ...garages], taxiPoints, roadNames);
  }

  async windowAt(position: Point, options: StreamWindowOptions = {}): Promise<CityMapData> {
    const initialWindow = this.centerId === null;
    const wanted = this.requiredEntries(position, options).map((entry) => entry.id);
    const centerId = this.entryAt(position).id;
    const settled = await Promise.allSettled(wanted.map((id) => this.loadChunk(id, options.signal)));
    const chunks = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!chunks.some((chunk) => chunk.id === centerId)) {
      const centerFailure = settled[wanted.indexOf(centerId)];
      throw centerFailure?.status === 'rejected' ? centerFailure.reason : new Error(`Chunk central indisponível: ${centerId}`);
    }
    const loadedIds = chunks.map((chunk) => chunk.id);
    this.currentIds = loadedIds;
    this.centerId = centerId;
    this.trimMemory(new Set([...wanted, ...this.protectedIds]));
    // A primeira janela já contém o bloco atual e a margem visual necessária.
    // Prefetch adicional aqui competia com a criação da cena, baixando dezenas
    // de MB antes de o jogador sequer poder dirigir. Nas janelas seguintes a
    // exploração volta a antecipar normalmente a direção do movimento.
    if (!initialWindow) this.scheduleExplorationPrefetch(position, options.heading, options.speedMps ?? 0);
    const graph = this.globalGraph ?? buildLocalNavigationGraph(chunks);
    this.graphRefreshPending = false;
    return this.compose(chunks, loadedIds, graph);
  }

  needsWindow(position: Point, options: StreamWindowOptions = {}) {
    const required = this.requiredEntries(position, options);
    return this.graphRefreshPending
      || this.entryAt(position).id !== this.centerId
      || required.some((entry) => !this.currentIds.includes(entry.id));
  }

  /** Ensures only the start, imminent boundary and destination landing blocks.
   * The compact global graph is already available; the remaining route
   * corridor is prefetched after calculation without blocking controls. */
  async ensureRouteData(from: Point, to: Point, signal?: AbortSignal) {
    const directDistance = Math.hypot(to.x - from.x, to.y - from.y);
    const progress = directDistance > 0 ? Math.min(1, 520 / directDistance) : 0;
    const imminent = { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    const ids = [...new Set([
      this.entryAt(from).id,
      this.entryAt(imminent).id,
      this.entryAt(to).id
    ])];
    for (const id of ids) this.protectedIds.add(id);
    const graphPromise = this.ensureGlobalGraph();
    await Promise.all([
      ...ids.map((id) => this.loadChunk(id, signal)),
      graphPromise
    ]);
    return graphPromise;
  }

  prioritizeRoute(route: Point[]) {
    this.protectedIds.clear();
    const ids: string[] = [];
    let carried = 0;
    for (let index = 0; index < route.length; index += 1) {
      if (index > 0) carried += Math.hypot(route[index].x - route[index - 1].x, route[index].y - route[index - 1].y);
      if (index === 0 || index === route.length - 1 || carried >= this.manifest.chunkSizeMeters * 0.65) {
        ids.push(this.entryAt(route[index]).id);
        carried = 0;
      }
    }
    for (const id of [...new Set(ids)]) {
      this.protectedIds.add(id);
      this.enqueuePrefetch(id, true);
    }
    this.pumpPrefetch();
  }

  clearRoutePriority() {
    this.protectedIds.clear();
  }

  location(position: Point) {
    const entry = this.entryAt(position);
    return {
      chunkId: entry.id,
      region: this.manifest.regions.find((region) => region.id === entry.regionId)
        ?? nearest(position, this.manifest.regions, (region) => region.center)
    };
  }

  private compose(chunks: CityMapChunk[], wanted: string[], graph: NavigationGraph): CityMapData {
    return {
      metadata: this.metadata,
      roads: uniqueBy(chunks.flatMap((chunk) => chunk.roads), (road) => road.id),
      lanes: uniqueBy(chunks.flatMap((chunk) => chunk.lanes), (lane) => lane.id),
      graph,
      signals: uniqueBy(chunks.flatMap((chunk) => chunk.signals), (signal) => signal.id),
      busStops: uniqueBy(chunks.flatMap((chunk) => chunk.busStops), (stop) => stop.id),
      buildings: uniqueBy(chunks.flatMap((chunk) => chunk.buildings), (building) => building.id),
      services: this.services,
      taxiPoints: this.taxiPoints,
      roadNames: this.roadNames,
      manifest: this.manifest,
      loadedChunkIds: [...wanted]
    };
  }

  private ensureGlobalGraph() {
    if (this.globalGraph) return Promise.resolve(this.globalGraph);
    this.globalGraphPromise ??= loadGzipJson<NavigationGraph | PackedNavigationGraph>(
      this.manifest.graphFile,
      undefined,
      this.manifest.dataRevision ?? this.manifest.mapVersion
    )
      .then(unpackNavigationGraph)
      .then((graph) => {
        this.globalGraph = graph;
        this.graphRefreshPending = true;
        return graph;
      })
      .catch((error) => {
        this.globalGraphPromise = undefined;
        throw error;
      });
    return this.globalGraphPromise;
  }

  private requiredEntries(position: Point, options: StreamWindowOptions) {
    const radius = options.radiusMeters ?? 520;
    const speed = Math.max(0, options.speedMps ?? 0);
    const lookAheadDistance = Math.min(420, speed * 8);
    const lookAhead = options.heading === undefined
      ? position
      : {
        x: position.x + Math.cos(options.heading) * lookAheadDistance,
        y: position.y + Math.sin(options.heading) * lookAheadDistance
      };
    const entries = this.manifest.chunks.filter((entry) =>
      distanceToBounds(position, entry.bounds) <= radius
      || (lookAheadDistance > 0 && distanceToBounds(lookAhead, entry.bounds) <= Math.min(260, radius))
    );
    const center = this.entryAt(position);
    if (!entries.some((entry) => entry.id === center.id)) entries.unshift(center);
    return entries.sort((a, b) => entryDistance(position, a) - entryDistance(position, b));
  }

  private entryAt(position: Point) {
    const id = `${Math.floor(position.x / this.manifest.chunkSizeMeters)}_${Math.floor(position.y / this.manifest.chunkSizeMeters)}`;
    return this.entries.get(id) ?? nearest(position, this.manifest.chunks, (entry) => ({
      x: (entry.bounds.minX + entry.bounds.maxX) / 2,
      y: (entry.bounds.minY + entry.bounds.maxY) / 2
    }));
  }

  private loadChunk(id: string, signal?: AbortSignal) {
    const cached = this.memory.get(id);
    if (cached) return Promise.resolve(cached);
    const pending = this.inflight.get(id);
    if (pending) return pending;
    const entry = this.entries.get(id);
    if (!entry) return Promise.reject(new Error(`Chunk inexistente: ${id}`));
    const revision = this.manifest.dataRevision ?? this.manifest.mapVersion;
    const request = loadJson<CityMapChunk>(entry.file, signal, true, revision)
      .catch(() => loadJson<CityMapChunk>(entry.file, signal, true, revision, true))
      .then((chunk) => {
        if (!signal?.aborted) this.memory.set(id, chunk);
        return chunk;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, request);
    return request;
  }

  private scheduleExplorationPrefetch(position: Point, heading?: number, speed = 0) {
    if (prefetchShouldPause()) return;
    const center = this.entryAt(position);
    const direction = heading === undefined ? { x: 0, y: 0 } : { x: Math.cos(heading), y: Math.sin(heading) };
    const candidates = center.adjacent
      .map((id) => this.entries.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => directionalPriority(center, b, direction, speed) - directionalPriority(center, a, direction, speed));
    for (const entry of candidates) this.enqueuePrefetch(entry.id, false);
    scheduleIdle(() => this.pumpPrefetch());
  }

  private enqueuePrefetch(id: string, urgent: boolean) {
    if (this.memory.has(id) || this.inflight.has(id) || this.prefetchQueue.includes(id)) return;
    if (urgent) this.prefetchQueue.unshift(id); else this.prefetchQueue.push(id);
  }

  private pumpPrefetch() {
    if (prefetchShouldPause()) return;
    const maximum = isSlowConnection() ? 1 : 2;
    while (this.prefetchActive < maximum && this.prefetchQueue.length) {
      const id = this.prefetchQueue.shift()!;
      this.prefetchActive += 1;
      void this.loadChunk(id)
        .catch(() => undefined)
        .finally(() => {
          this.prefetchActive -= 1;
          this.trimMemory(new Set([...this.currentIds, ...this.protectedIds]));
          scheduleIdle(() => this.pumpPrefetch());
        });
    }
  }

  private trimMemory(active: Set<string>) {
    if (this.memory.size <= MAX_MEMORY_CHUNKS) return;
    for (const id of this.memory.keys()) {
      if (!active.has(id)) this.memory.delete(id);
      if (this.memory.size <= MAX_MEMORY_CHUNKS) break;
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

function buildLocalNavigationGraph(chunks: CityMapChunk[]) {
  const roads = uniqueBy(chunks.flatMap((chunk) => chunk.roads), (road) => road.id);
  const graph = buildLaneGraph(roads).graph;
  return { ...graph, version: `${graph.version}-local` };
}

function nearest<T>(position: Point, values: T[], pointFor: (value: T) => Point) {
  if (!values.length) throw new Error('Manifesto do mapa nÃ£o possui chunks ou regiÃµes.');
  return values.reduce((best, value) => distance(position, pointFor(value)) < distance(position, pointFor(best)) ? value : best);
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function entryDistance(position: Point, entry: CityMapManifest['chunks'][number]) {
  return Math.hypot(
    position.x - (entry.bounds.minX + entry.bounds.maxX) / 2,
    position.y - (entry.bounds.minY + entry.bounds.maxY) / 2
  );
}

function distanceToBounds(point: Point, bounds: CityMapManifest['chunks'][number]['bounds']) {
  const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const dy = Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY);
  return Math.hypot(dx, dy);
}

function directionalPriority(
  center: CityMapManifest['chunks'][number],
  candidate: CityMapManifest['chunks'][number],
  direction: Point,
  speed: number
) {
  const dx = (candidate.bounds.minX + candidate.bounds.maxX - center.bounds.minX - center.bounds.maxX) / 2;
  const dy = (candidate.bounds.minY + candidate.bounds.maxY - center.bounds.minY - center.bounds.maxY) / 2;
  const length = Math.hypot(dx, dy) || 1;
  return (dx / length * direction.x + dy / length * direction.y) * Math.min(2, speed / 5);
}

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

function connectionInformation() {
  return (typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: NetworkInformation }).connection);
}

function isSlowConnection() {
  return ['2g', 'slow-2g'].includes(connectionInformation()?.effectiveType ?? '');
}

function prefetchShouldPause() {
  const connection = connectionInformation();
  return connection?.saveData === true || connection?.effectiveType === 'slow-2g';
}

function scheduleIdle(callback: () => void) {
  const idle = (globalThis as typeof globalThis & { requestIdleCallback?: (work: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(callback, { timeout: 1_200 }); else setTimeout(callback, 32);
}

function unpackNavigationGraph(graph: NavigationGraph | PackedNavigationGraph): NavigationGraph {
  if (graph.kind !== 'packed-lane') return graph;
  const precision = graph.precision;
  return {
    kind: 'lane',
    version: graph.version,
    nodes: graph.nodes.map((packed, index) => ({
      id: index.toString(36),
      x: packed[0] / precision,
      y: packed[1] / precision,
      edges: packed[2].map((edge) => ({
        to: edge[0].toString(36),
        distance: edge[1] / precision,
        roadId: graph.roads[edge[2]],
        highway: edge[3] >= 0 ? graph.highways[edge[3]] : undefined,
        connector: edge[4] === 1 || undefined
      }))
    }))
  };
}
