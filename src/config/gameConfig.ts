import { COLLISION_PHYSICS, VEHICLE_PHYSICS } from './vehiclePhysics';

export const GAME_CONFIG = {
  version: '0.8.4',
  saveVersion: 9,
  mapVersion: 'brasilia-0.8.2',
  map: {
    city: 'Brasília',
    district: 'Rodoviária do Plano Piloto e Eixo Monumental',
    worldSizeMeters: 16_000,
    projectionYScale: 0.72,
    projectionSkew: 0.18,
    chunkSizeMeters: 800
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
    // A 0.6.0 mantém o teto técnico de 350, mas usa uma população padrão
    // bem mais leve para evitar quedas de quadros em celulares e notebooks.
    npcVehicleCount: 54,
    npcBusCount: 9,
    npcUtilityCount: 9,
    maximumTerrestrialEntities: 350,
    npcSpeedMps: 8.5,
    safetyDistanceMeters: 9,
    collisionStunSeconds: COLLISION_PHYSICS.npcStunSeconds,
    autopilotCollisionGhostSeconds: COLLISION_PHYSICS.autopilotGhostSeconds,
    autopilotHeadOnDeadlockSeconds: 0.45,
    autopilotFollowingDeadlockSeconds: 10,
    stuckRecoveryMaximumSeconds: 5,
    stuckRecoveryEscapeDistanceMeters: 18,
    stuckRecoverySpeedMps: 4.2,
    collisionCooldownSeconds: COLLISION_PHYSICS.cooldownSeconds,
    collision: COLLISION_PHYSICS,
    densityMultipliers: { low: 0.28, medium: 0.56, high: 1, automatic: 1 },
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
  taxi: {
    regularizationCost: 220,
    conversionCost: 75,
    meter: {
      initialFare: 6.75,
      perKilometer: 4.9,
      waitingPerMinute: 0.42,
      minimumFare: 12,
      safetyLimit: 85
    }
  },
  fleet: {
    capacity: 5,
    maximumEmployees: 5,
    garageVehicleCapacity: 5,
    garageEmployeeCapacity: 5,
    regionalGaragePrice: 1_250,
    regionalGarageOperatingCost: 8,
    vehicleTransferCost: 35,
    employeeTrainingCost: 90,
    deliveryBusinessPrice: 480,
    freightBusinessPrice: 1_200,
    passengerVehiclePrices: { 'Compacto 2010': 820, 'Sedan Executivo 2018': 1_450, 'SUV Urbano 2020': 2_100 },
    vehiclePrices: {
      'Moto Urbana 125': 280, 'Moto Cargo 160': 430, 'Scooter Express 150': 360, 'Triciclo Cargo 200': 620, 'Hatch Entrega': 780,
      'Furgão Compacto': 1_050, 'Van de Carga': 1_750, 'Picape Leve': 1_350, 'Furgão Médio': 2_250, 'Utilitário Baú': 3_400
    },
    secondVehiclePrice: 650,
    secondVehicleCondition: 78,
    offlineMaximumHours: 8,
    reducedEfficiencyAfterHours: 4,
    defaultShiftMinutes: 240,
    physicalDetailRadiusMeters: 650,
    simplifiedRadiusMeters: 1_600
  },
  online: {
    protocolVersion: 1,
    worldId: 'city:brasilia:public:1',
    presenceTopic: 'city:brasilia:presence',
    nearbyDistanceMeters: 180,
    mediumDistanceMeters: 520,
    distantDistanceMeters: 1_200,
    interpolationDelayMs: 120,
    maximumExtrapolationMs: 400,
    staleAfterMs: 1_200,
    removeAfterMs: 8_000,
    chunkOverlapMs: 2_500,
    heartbeatMs: 15_000,
    maximumVisibleRemotes: 24,
    movementPayloadBytes: 640
  },
  environment: {
    aircraftCount: 7,
    helicopterCount: 3
  }
} as const;
