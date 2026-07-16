export const GAME_CONFIG = {
  version: '0.2.0',
  saveVersion: 1,
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
    maxSpeedMps: 25,
    maxReverseMps: 5,
    accelerationMps2: 9,
    reverseAccelerationMps2: 4,
    brakeMps2: 10,
    rollingResistance: 0.65,
    offRoadResistance: 3.5,
    steeringRadiansPerSecond: 2.65,
    steeringAssistRadiansPerSecond: 0.9,
    steeringAssistMaxAngle: 0.72,
    lengthMeters: 4.1,
    widthMeters: 1.82,
    fuelCapacityLiters: 40,
    idleFuelLitersPerSecond: 0.0002,
    movingFuelLitersPerMeter: 0.00011
  },
  initialPlayer: {
    money: 100,
    fuel: 18,
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
    npcVehicleCount: 26,
    npcBusCount: 4,
    npcUtilityCount: 5,
    npcSpeedMps: 8.5,
    safetyDistanceMeters: 9,
    signal: { greenSeconds: 12, yellowSeconds: 3, allRedSeconds: 1 },
    redLightPenalty: 2
  },
  camera: {
    defaultZoom: 4,
    minZoom: 1.5,
    maxZoom: 6,
    followLerp: 0.08
  },
  storage: {
    key: 'rota-brasil-tycoon-save',
    autosaveMs: 5_000
  }
} as const;
