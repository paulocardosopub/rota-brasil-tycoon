import type { EmployeeCandidate, ShiftPolicy } from '../../types/game';
import { DEFAULT_EMPLOYEE_REGIONAL_PREFERENCES } from '../regions/RegionalDefaults';

export const EMPLOYEE_CANDIDATES: EmployeeCandidate[] = [
  { id: 'bia-rocha', name: 'Bia Rocha', avatar: 'BR', experience: 2, driving: 72, safety: 88, service: 82, efficiency: 78, commissionPercent: 24, hireCost: 160, description: 'Direção segura e atendimento consistente; ótima primeira contratação.' },
  { id: 'leo-martins', name: 'Léo Martins', avatar: 'LM', experience: 3, driving: 86, safety: 70, service: 74, efficiency: 84, commissionPercent: 27, hireCost: 205, description: 'Rápido e eficiente, com risco um pouco maior em turnos longos.' },
  { id: 'nara-souza', name: 'Nara Souza', avatar: 'NS', experience: 1, driving: 66, safety: 76, service: 91, efficiency: 70, commissionPercent: 21, hireCost: 135, description: 'Excelente atendimento e contratação acessível, ainda ganhando experiência.' }
];

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
