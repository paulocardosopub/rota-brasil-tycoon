import type { BusLine, Point } from '../../types/game';
import { latLonToLocalMeters } from '../../map/projection/localMeters';

export const BRASILIA_MAP_ORIGIN = { lat: -15.7942, lon: -47.8822 };

const officialSource = 'https://dfnoponto.semob.df.gov.br/pesquisa-por-linhas/';
const osmLicense = 'Dados operacionais: Semob/DF; geografia: OpenStreetMap contributors, ODbL 1.0';
const stop = (id: string, name: string, lat: number, lon: number, osmType: 'node' | 'way' | 'relation', osmId: string, regionId: string) => ({ id, name, lat, lon, osmType, osmId, regionId });

/**
 * Catálogo reduzido para gameplay. Os códigos e corredores são reais; as paradas
 * publicadas são âncoras OSM auditáveis e não substituem a tabela oficial completa.
 */
export const BUS_LINES: BusLine[] = [
  { id: 'df-0107', publicCode: '0.107', name: 'Rodoviária • W3/L2 Sul • Esplanada', operator: 'STPC/DF', color: '#2e86de', distanceKm: 15.2, estimatedMinutes: 43, fare: 5.5, demand: 'high', expectedOperatingCost: 38, expectedProfit: 42, sourceUrl: officialSource, sourceLicense: osmLicense, stops: [
    stop('rodoviaria-pp', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro'),
    stop('w3-703', 'W3 Sul • 703', -15.8027307, -47.8955193, 'way', '263590275', 'asa-sul'),
    stop('w3-710', 'W3 Sul • 710', -15.8138376, -47.9083178, 'way', '915117546', 'asa-sul'),
    stop('eixo-l-sul', 'Eixo L Sul', -15.8113002, -47.8930947, 'way', '915505200', 'asa-sul'),
    stop('rodoviaria-pp-return', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro')
  ]},
  { id: 'df-0110', publicCode: '0.110', name: 'Rodoviária • Universidade de Brasília', operator: 'STPC/DF', color: '#16a085', distanceKm: 10.4, estimatedMinutes: 32, fare: 5.5, demand: 'high', expectedOperatingCost: 29, expectedProfit: 35, sourceUrl: officialSource, sourceLicense: osmLicense, stops: [
    stop('rodoviaria-110', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro'),
    stop('unb-icc-norte', 'UnB • ICC Norte', -15.7617758, -47.8699751, 'way', '704086715', 'asa-norte'),
    stop('rodoviaria-110-return', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro')
  ]},
  { id: 'df-0385', publicCode: '0.385', name: 'Rodoviária • Sudoeste/Octogonal', operator: 'STPC/DF', color: '#8e44ad', distanceKm: 18.6, estimatedMinutes: 51, fare: 5.5, demand: 'medium', expectedOperatingCost: 46, expectedProfit: 39, sourceUrl: officialSource, sourceLicense: osmLicense, stops: [
    stop('rodoviaria-385', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro'),
    stop('sudoeste', 'Sudoeste', -15.8002187, -47.9243896, 'relation', '3359488', 'sudoeste'),
    stop('octogonal-brt', 'Octogonal • BRT Oeste', -15.8107717, -47.9440532, 'way', '1456382131', 'cruzeiro'),
    stop('rodoviaria-385-return', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro')
  ]},
  { id: 'df-0147', publicCode: '0.147', name: 'São Sebastião • Residencial do Bosque • Rodoviária', operator: 'STPC/DF', color: '#d35400', distanceKm: 31.8, estimatedMinutes: 74, fare: 5.5, demand: 'medium', expectedOperatingCost: 71, expectedProfit: 54, sourceUrl: 'https://www.jardimbotanico.df.gov.br/visitacao/como-chegar/', sourceLicense: osmLicense, stops: [
    stop('rodoviaria-147', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro'),
    stop('ponte-garcas', 'Ponte das Garças', -15.8432410, -47.8969563, 'way', '14477045', 'lago-sul'),
    stop('solar-jb', 'Solar de Brasília • Jardim Botânico', -15.8510392, -47.8135429, 'way', '293384918', 'jardim-botanico'),
    stop('rodoviaria-147-return', 'Rodoviária do Plano Piloto', -15.7938466, -47.8833663, 'way', '41648328', 'centro')
  ]}
];

export function busStopPoint(lineId: string, stopIndex: number): Point | null {
  const selected = BUS_LINES.find((line) => line.id === lineId)?.stops[stopIndex];
  return selected ? latLonToLocalMeters(selected.lat, selected.lon, BRASILIA_MAP_ORIGIN) : null;
}

export function busCapacity(model: string) { return model === 'Micro-ônibus Urbano' ? 24 : model === 'Ônibus Urbano Convencional' ? 72 : 0; }
