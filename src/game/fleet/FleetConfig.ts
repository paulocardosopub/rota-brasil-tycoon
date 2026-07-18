import type { EmployeeCandidate, ShiftPolicy } from '../../types/game';
import { DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES } from '../regions/RegionalDefaults';

export const EMPLOYEE_CANDIDATES: EmployeeCandidate[] = [
  candidate('bia-rocha','Bia Rocha','BR',72,88,82,78,24,160,['CAR','TAXI']),
  candidate('leo-martins','Léo Martins','LM',86,70,74,84,27,205,['CAR','TAXI','DELIVERY_VAN']),
  candidate('nara-souza','Nara Souza','NS',66,76,91,70,21,135,['CAR','TAXI']),
  candidate('caue-lima','Cauê Lima','CL',83,81,70,88,25,190,['CAR','MOTORCYCLE']),
  candidate('joana-reis','Joana Reis','JR',78,92,86,76,26,215,['CAR','TAXI','MOTORCYCLE']),
  candidate('davi-castro','Davi Castro','DC',75,79,73,85,23,175,['CAR','DELIVERY_VAN']),
  candidate('maya-freitas','Maya Freitas','MF',81,87,89,80,28,230,['CAR','TAXI','LIGHT_FREIGHT']),
  candidate('rui-alves','Rui Alves','RA',88,74,68,90,27,220,['CAR','MOTORCYCLE','DELIVERY_VAN']),
  candidate('lina-paz','Lina Paz','LP',73,90,94,74,24,185,['CAR','TAXI']),
  candidate('igor-melo','Igor Melo','IM',84,82,72,83,26,210,['CAR','DELIVERY_VAN','LIGHT_FREIGHT']),
  candidate('sara-nunes','Sara Nunes','SN',77,86,88,79,25,200,['CAR','MOTORCYCLE']),
  candidate('enzo-viana','Enzo Viana','EV',80,77,76,87,24,195,['CAR','LIGHT_FREIGHT'])
];

function candidate(id: string, name: string, avatar: string, driving: number, safety: number, service: number, efficiency: number, commissionPercent: number, hireCost: number, qualifications: EmployeeCandidate['qualifications']): EmployeeCandidate {
  return { id, name, avatar, experience: 2, driving, safety, service, efficiency, commissionPercent, hireCost, qualifications, description: `${qualifications.join(' • ')}; perfil fictício para operações regionais.` };
}

export const DEFAULT_SHIFT_POLICY: ShiftPolicy = {
  minimumFuelPercent: 20,
  automaticRepairLimit: 80,
  minimumCondition: 45,
  categories: ['popular', 'comfort'],
  durationMinutes: 240,
  returnToGarage: true,
  pauseOnLoss: true,
  regional: { ...DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES }
};
