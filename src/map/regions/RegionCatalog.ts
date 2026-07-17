import type { MapRegion, Point, ServiceCategory } from '../../types/game';
import { latLonToLocalMeters } from '../projection/localMeters';

type LatLon = readonly [lat: number, lon: number];

interface RegionDefinition {
  id: string;
  name: string;
  center: LatLon;
  polygon: readonly LatLon[];
  neighbors: string[];
  color: string;
  predominantType: MapRegion['predominantType'];
  demandLevel: MapRegion['demandLevel'];
  servicesAvailable: ServiceCategory[];
  playable: boolean;
  priority?: number;
  source: MapRegion['source'];
}

const osm = (objectId: string, note?: string): MapRegion['source'] => ({
  name: 'OpenStreetMap contributors',
  objectId,
  url: `https://www.openstreetmap.org/${objectId.replace(':', '/')}`,
  note
});

const rectangle = (south: number, west: number, north: number, east: number): LatLon[] => [
  [south, west], [south, east], [north, east], [north, west], [south, west]
];

// Subdivisões operacionais do Plano Piloto usam pontos/limites OSM como
// referência. As RAs prioritárias usam os polígonos administrativos OSM
// simplificados em ~100 m. O aeroporto é um enclave intencional do Lago Sul.
export const REGION_DEFINITIONS: readonly RegionDefinition[] = [
  {
    id: 'aeroporto', name: 'Aeroporto', center: [-15.871745, -47.911724],
    polygon: rectangle(-15.883316, -47.949299, -15.860176, -47.895989),
    neighbors: ['asa-sul', 'lago-sul'], color: '#bfa8ff', predominantType: 'airport', demandLevel: 'high',
    servicesAvailable: ['fuel', 'garage'], playable: true, priority: 100,
    source: osm('way:534162966', 'Footprint operacional do Aeroporto Internacional de Brasília.')
  },
  {
    id: 'jardim-botanico', name: 'Jardim Botânico', center: [-15.863892, -47.788521],
    polygon: [[-15.877058,-47.823074],[-15.885192,-47.821789],[-15.884962,-47.815535],[-15.891112,-47.795739],[-15.890189,-47.793368],[-15.884601,-47.796148],[-15.879956,-47.79502],[-15.876148,-47.800365],[-15.869263,-47.790204],[-15.870504,-47.786671],[-15.875994,-47.78855],[-15.885211,-47.774018],[-15.892862,-47.767608],[-15.886302,-47.762075],[-15.891503,-47.75721],[-15.887845,-47.751715],[-15.874027,-47.752052],[-15.870578,-47.750538],[-15.868738,-47.748338],[-15.86942,-47.742797],[-15.866363,-47.741762],[-15.865584,-47.743411],[-15.862134,-47.74341],[-15.859737,-47.747232],[-15.853682,-47.745455],[-15.8408,-47.760023],[-15.83448,-47.771957],[-15.839092,-47.782185],[-15.838418,-47.786812],[-15.844169,-47.791917],[-15.834219,-47.796614],[-15.832422,-47.800406],[-15.834818,-47.804038],[-15.851412,-47.816093],[-15.877058,-47.823074]],
    neighbors: ['lago-sul'], color: '#77d486', predominantType: 'residential', demandLevel: 'medium',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 90,
    source: osm('relation:3359472')
  },
  {
    id: 'lago-norte', name: 'Lago Norte', center: [-15.734235, -47.864158],
    polygon: [[-15.728533,-47.909682],[-15.727103,-47.904331],[-15.727787,-47.897031],[-15.730192,-47.894753],[-15.728807,-47.884411],[-15.730089,-47.881084],[-15.741073,-47.872465],[-15.743393,-47.865578],[-15.747358,-47.862785],[-15.750967,-47.852044],[-15.754612,-47.846796],[-15.759942,-47.845003],[-15.765668,-47.835961],[-15.771752,-47.834931],[-15.773661,-47.831872],[-15.769724,-47.82922],[-15.760521,-47.826893],[-15.755555,-47.829874],[-15.750688,-47.827676],[-15.74425,-47.840006],[-15.738921,-47.844255],[-15.737456,-47.84772],[-15.73105,-47.853468],[-15.730559,-47.855952],[-15.726162,-47.859341],[-15.724489,-47.858842],[-15.724449,-47.856991],[-15.729051,-47.852142],[-15.728079,-47.851565],[-15.729547,-47.847721],[-15.734881,-47.843948],[-15.734155,-47.838576],[-15.737288,-47.835908],[-15.742002,-47.83565],[-15.740928,-47.832651],[-15.74376,-47.830306],[-15.742667,-47.828841],[-15.745515,-47.824074],[-15.749103,-47.821091],[-15.752343,-47.821318],[-15.751394,-47.816114],[-15.758551,-47.819828],[-15.763719,-47.813751],[-15.76491,-47.818803],[-15.773889,-47.817371],[-15.779272,-47.810923],[-15.785427,-47.806436],[-15.787613,-47.806476],[-15.790537,-47.798068],[-15.788363,-47.795078],[-15.790757,-47.794276],[-15.790247,-47.790708],[-15.78859,-47.789515],[-15.790588,-47.789023],[-15.78208,-47.786607],[-15.781115,-47.794561],[-15.787356,-47.803705],[-15.77241,-47.81314],[-15.769186,-47.812595],[-15.764892,-47.808629],[-15.759972,-47.811892],[-15.757449,-47.811706],[-15.761581,-47.78915],[-15.758434,-47.778136],[-15.724678,-47.791375],[-15.694175,-47.834388],[-15.692414,-47.8519],[-15.688116,-47.859712],[-15.701347,-47.884606],[-15.704703,-47.88251],[-15.708164,-47.872438],[-15.711186,-47.87227],[-15.711719,-47.873923],[-15.713905,-47.869919],[-15.717818,-47.872243],[-15.715094,-47.877093],[-15.712058,-47.878359],[-15.706961,-47.891924],[-15.713242,-47.900119],[-15.728533,-47.909682]],
    neighbors: ['asa-norte', 'unb', 'vila-planalto'], color: '#54b9dc', predominantType: 'residential', demandLevel: 'medium',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 80,
    source: osm('relation:3359473')
  },
  {
    id: 'lago-sul', name: 'Lago Sul', center: [-15.839182, -47.875534],
    polygon: [[-15.952497,-47.98373],[-15.96058,-47.978019],[-15.96159,-47.96935],[-15.967718,-47.966582],[-15.96846,-47.957398],[-15.979267,-47.955854],[-15.983448,-47.942942],[-15.983651,-47.933576],[-15.963268,-47.876848],[-15.927641,-47.831942],[-15.909433,-47.821868],[-15.902924,-47.819859],[-15.895814,-47.819626],[-15.877058,-47.823074],[-15.865049,-47.82068],[-15.851412,-47.816093],[-15.823688,-47.795596],[-15.806016,-47.787098],[-15.802022,-47.785933],[-15.800003,-47.789373],[-15.795928,-47.789302],[-15.795944,-47.794685],[-15.797261,-47.795461],[-15.795771,-47.797602],[-15.797286,-47.798483],[-15.795197,-47.798601],[-15.794428,-47.803509],[-15.792748,-47.802487],[-15.793224,-47.809279],[-15.803064,-47.815372],[-15.806069,-47.813412],[-15.805727,-47.817018],[-15.809038,-47.818927],[-15.817122,-47.819356],[-15.821305,-47.816459],[-15.821969,-47.821164],[-15.828144,-47.827426],[-15.832551,-47.825501],[-15.831028,-47.833794],[-15.83306,-47.837972],[-15.839483,-47.840901],[-15.839875,-47.85365],[-15.849654,-47.8638],[-15.85151,-47.858433],[-15.853097,-47.858869],[-15.852113,-47.866926],[-15.854007,-47.869746],[-15.855921,-47.86875],[-15.85886,-47.871568],[-15.857376,-47.87466],[-15.852954,-47.869091],[-15.850084,-47.868171],[-15.84796,-47.869813],[-15.844584,-47.868223],[-15.834298,-47.860742],[-15.829404,-47.854824],[-15.827403,-47.855324],[-15.82782,-47.86615],[-15.829976,-47.870682],[-15.82458,-47.871826],[-15.824667,-47.87699],[-15.828521,-47.880786],[-15.828574,-47.883187],[-15.835622,-47.885011],[-15.840922,-47.892196],[-15.840582,-47.898122],[-15.851614,-47.919796],[-15.851353,-47.932296],[-15.867096,-47.936635],[-15.869628,-47.935828],[-15.881189,-47.956357],[-15.884486,-47.951913],[-15.894238,-47.946559],[-15.895534,-47.939997],[-15.884268,-47.922945],[-15.881156,-47.906047],[-15.890648,-47.905679],[-15.900109,-47.91054],[-15.907365,-47.912273],[-15.90991,-47.92137],[-15.913426,-47.926795],[-15.931127,-47.930772],[-15.941884,-47.943171],[-15.941883,-47.945632],[-15.94436,-47.947876],[-15.946289,-47.959123],[-15.950565,-47.964216],[-15.952497,-47.98373]],
    neighbors: ['asa-sul', 'centro', 'vila-planalto', 'jardim-botanico', 'aeroporto'], color: '#42c7a5', predominantType: 'residential', demandLevel: 'high',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 70,
    source: osm('relation:3359474')
  },
  {
    id: 'sudoeste', name: 'Sudoeste', center: [-15.800219, -47.92439],
    polygon: [[-15.810124,-47.948438],[-15.810765,-47.939393],[-15.806484,-47.927821],[-15.798763,-47.914137],[-15.796953,-47.917518],[-15.784982,-47.913576],[-15.780038,-47.929264],[-15.792323,-47.933431],[-15.797941,-47.933479],[-15.802295,-47.940427],[-15.800173,-47.946175],[-15.810124,-47.948438]],
    neighbors: ['asa-sul', 'centro', 'cruzeiro', 'noroeste'], color: '#ffb84d', predominantType: 'mixed', demandLevel: 'high',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 60,
    source: osm('relation:3359488')
  },
  {
    id: 'cruzeiro', name: 'Cruzeiro', center: [-15.790782, -47.937443],
    polygon: [[-15.800173,-47.946175],[-15.802295,-47.940427],[-15.797941,-47.933479],[-15.792323,-47.933431],[-15.780038,-47.929264],[-15.777137,-47.938482],[-15.800173,-47.946175]],
    neighbors: ['sudoeste', 'noroeste', 'asa-sul'], color: '#e9a5cc', predominantType: 'residential', demandLevel: 'medium',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 60,
    source: osm('relation:3359467')
  },
  {
    id: 'vila-planalto', name: 'Vila Planalto', center: [-15.79268, -47.850277],
    polygon: rectangle(-15.797104, -47.857898, -15.789872, -47.843998),
    neighbors: ['centro', 'unb', 'lago-norte', 'lago-sul'], color: '#f4896b', predominantType: 'mixed', demandLevel: 'medium',
    servicesAvailable: ['fuel', 'workshop'], playable: true, priority: 50,
    source: osm('relation:7063466')
  },
  {
    id: 'noroeste', name: 'Noroeste', center: [-15.750632, -47.912568],
    polygon: rectangle(-15.780038, -47.929264, -15.730632, -47.91),
    neighbors: ['asa-norte', 'sudoeste', 'cruzeiro'], color: '#8ca8ff', predominantType: 'residential', demandLevel: 'medium',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 40,
    source: osm('node:2673888477', 'Geofence operacional do Setor Noroeste, limitada pelas RAs vizinhas.')
  },
  {
    id: 'asa-norte', name: 'Asa Norte', center: [-15.762798, -47.883951],
    polygon: rectangle(-15.781, -47.91, -15.73, -47.858),
    neighbors: ['centro', 'noroeste', 'unb', 'lago-norte'], color: '#65b8ff', predominantType: 'mixed', demandLevel: 'high',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 30,
    source: osm('node:1382321561', 'Geofence operacional da Asa Norte dentro do Plano Piloto.')
  },
  {
    id: 'unb', name: 'Universidade de Brasília', center: [-15.765, -47.845],
    polygon: rectangle(-15.79, -47.858, -15.73, -47.83),
    neighbors: ['asa-norte', 'centro', 'vila-planalto', 'lago-norte'], color: '#d7c86d', predominantType: 'university', demandLevel: 'medium',
    servicesAvailable: ['fuel', 'workshop'], playable: true, priority: 25,
    source: osm('relation:1213737', 'Geofence operacional do campus e setores adjacentes.')
  },
  {
    id: 'asa-sul', name: 'Asa Sul', center: [-15.815, -47.9],
    polygon: rectangle(-15.84, -47.925, -15.802, -47.875),
    neighbors: ['centro', 'sudoeste', 'cruzeiro', 'lago-sul', 'aeroporto'], color: '#ff846d', predominantType: 'mixed', demandLevel: 'high',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 20,
    source: osm('node:8539732925', 'Geofence operacional da Asa Sul dentro do Plano Piloto.')
  },
  {
    id: 'centro', name: 'Setores Centrais', center: [-15.794, -47.882],
    polygon: rectangle(-15.802, -47.913576, -15.781, -47.858),
    neighbors: ['asa-sul', 'asa-norte', 'sudoeste', 'vila-planalto', 'lago-sul'], color: '#ffd64d', predominantType: 'central', demandLevel: 'high',
    servicesAvailable: ['fuel', 'workshop', 'garage'], playable: true, priority: 10,
    source: osm('relation:3359478', 'Geofence operacional dos setores centrais do Plano Piloto.')
  }
] as const;

export function buildRegionCatalog(origin: { lat: number; lon: number }): MapRegion[] {
  return REGION_DEFINITIONS.map((definition) => {
    const polygon = definition.polygon.map(([lat, lon]) => latLonToLocalMeters(lat, lon, origin));
    return {
      ...definition,
      polygon,
      center: latLonToLocalMeters(definition.center[0], definition.center[1], origin),
      bounds: boundsFor(polygon),
      chunkIds: [],
      priority: definition.priority ?? 0
    };
  });
}

export function regionAt(point: Point, regions: readonly MapRegion[]): MapRegion {
  const containing = regions
    .filter((region) => pointInPolygon(point, region.polygon))
    .sort((a, b) => b.priority - a.priority)[0];
  return containing ?? regions.reduce((best, region) =>
    distanceToBounds(point, region.bounds) < distanceToBounds(point, best.bounds) ? region : best
  );
}

export function pointInPolygon(point: Point, polygon: readonly Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function familiarityLevel(completedRides: number, kilometers: number) {
  if (completedRides >= 12 || kilometers >= 45) return 'favorite' as const;
  if (completedRides >= 4 || kilometers >= 12) return 'known' as const;
  return 'new' as const;
}

function boundsFor(points: readonly Point[]) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x), maxY: Math.max(bounds.maxY, point.y)
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function distanceToBounds(point: Point, bounds: MapRegion['bounds']) {
  const dx = Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX);
  const dy = Math.max(bounds.minY - point.y, 0, point.y - bounds.maxY);
  return Math.hypot(dx, dy);
}
