import { COLLISION_PHYSICS, VEHICLE_PHYSICS } from './vehiclePhysics';

export const GAME_CONFIG = {
  version: '0.5.0',
  saveVersion: 3,
  map: {
    city: 'Brasília',
    district: 'Rodoviária do Plano Piloto e Eixo Monumental',
    worldSizeMeters: 2_200,
    projectionYScale: 0.72,
    projectionSkew: 0.18,
    chunkSizeMeters: 400
  },
  vehicle: {
    name: 'Hatch 1998',
    ...VEHICLE_PHYSICS
  },
  initialPlayer: {
    money: 100,
    fuel: 1,
    condition: 70,
    xp: 0,
    rating: 5,
    completedRides: 0
  },
  fare: {
    base: 5,
    perKilometer: 1.8,
    perMinute: 0.35,
    testMultiplier: 2.5,
    maxRatingBonusPercent: 0.12,
    cancellationPenalty: 3
  },
  mission: {
    interactionRadiusMeters: 8,
    maxInteractionSpeedKmh: 5,
    autopilotInteractionRadiusMeters: 12,
    autopilotMaxInteractionSpeedKmh: 8,
    newRideDelayMs: 5_000,
    passengerNames: ['Ana Luz', 'Caio Nunes', 'Dandara Reis', 'João Viana', 'Lia Campos', 'Ravi Torres'],
    pickupLines: ['Bom dia! Vamos por um caminho tranquilo?', 'Oi! Ainda bem que você chegou.', 'Tudo certo? Pode seguir.'],
    dropoffLines: ['Chegamos! Obrigado pela corrida.', 'Perfeito, valeu pela viagem!', 'Ótima direção. Até a próxima!'],
    locationLabels: [
      'Rodoviária do Plano Piloto',
      'Teatro Nacional',
      'Setor Bancário Norte',
      'Conjunto Nacional',
      'Biblioteca Nacional',
      'Museu Nacional',
      'Esplanada dos Ministérios',
      'Setor Hoteleiro Sul',
      'Torre de TV',
      'Parque da Cidade',
      'Setor Comercial Sul',
      'Catedral Metropolitana',
      'Eixo Monumental',
      'Via N1',
      'Via S1',
      'Setor de Diversões Sul'
    ]
  },
  traffic: {
    npcVehicleCount: 260,
    npcBusCount: 40,
    npcUtilityCount: 50,
    npcSpeedMps: 8.5,
    safetyDistanceMeters: 9,
    collisionStunSeconds: COLLISION_PHYSICS.npcStunSeconds,
    autopilotCollisionGhostSeconds: COLLISION_PHYSICS.autopilotGhostSeconds,
    autopilotHeadOnDeadlockSeconds: 0.45,
    collisionCooldownSeconds: COLLISION_PHYSICS.cooldownSeconds,
    collision: COLLISION_PHYSICS,
    densityMultipliers: { low: 0.18, medium: 0.48, high: 1, automatic: 1 },
    signal: { greenSeconds: 12, yellowSeconds: 3, allRedSeconds: 1 },
    redLightPenalty: 2
  },
  camera: {
    defaultZoom: 4,
    minZoom: 1.5,
    maxZoom: 6,
    followLerp: 0.08,
    zoomPresets: { near: 4.8, normal: 4, far: 3.1 }
  },
  storage: {
    key: 'rota-brasil-tycoon-save',
    backupKey: 'rota-brasil-tycoon-save-backup',
    corruptKey: 'rota-brasil-tycoon-save-corrupt',
    autosaveMs: 5_000,
    ledgerLimit: 240,
    rideHistoryLimit: 50
  },
  services: {
    interactionRadiusMeters: 15,
    maximumInteractionSpeedKmh: 4,
    fuelPricePerLiter: 5.79,
    emergencyFuelLiters: 3,
    emergencyFuelFee: 28
  },
  progression: {
    xpPerLevel: 180,
    regularization: {
      completedRides: 15,
      driverLevel: 4,
      rating: 4.25,
      totalKm: 18,
      money: 250
    }
  },
  environment: {
    aircraftCount: 7,
    helicopterCount: 3
  }
} as const;
