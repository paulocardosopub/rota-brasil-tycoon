import type { BusStop, CityMapData, MapBuilding, MapMetadata, MapServiceLocation, MapSignal, NavigationGraph, RoadData } from '../types/game';

async function loadJson<T>(filename: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/cities/brasilia/central/${filename}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao carregar ${filename}: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function loadCityMap(): Promise<CityMapData> {
  const [metadata, roads, graph, signals, busStops, buildings, fuelStations, workshops, garages] = await Promise.all([
    loadJson<MapMetadata>('metadata.json'),
    loadJson<RoadData[]>('roads.json'),
    loadJson<NavigationGraph>('navigation-graph.json'),
    loadJson<MapSignal[]>('traffic-signals.json'),
    loadJson<BusStop[]>('bus-stops.json'),
    loadJson<MapBuilding[]>('buildings.json'),
    loadJson<MapServiceLocation[]>('services/fuel-stations.json'),
    loadJson<MapServiceLocation[]>('services/workshops.json'),
    loadJson<MapServiceLocation[]>('services/garages.json')
  ]);
  return { metadata, roads, graph, signals, busStops, buildings, services: [...fuelStations, ...workshops, ...garages] };
}
