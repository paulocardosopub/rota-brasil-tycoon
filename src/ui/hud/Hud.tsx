import { useEffect, useState } from 'react';
import { GAME_CONFIG } from '../../config/gameConfig';
import { formatCurrency } from '../../game/economy/fare';
import { ECONOMY_CONFIG, UPGRADE_IDS } from '../../game/economy/EconomyConfig';
import { fuelPurchaseCost, upgradePrice, workshopPrice, type WorkshopServiceId } from '../../game/economy/ExpenseCalculator';
import { gameEvents, type GameCommand } from '../../game/events';
import { EMPLOYEE_CANDIDATES } from '../../game/fleet/FleetConfig';
import { employeeIdentification } from '../../game/fleet/FleetRoutePlan';
import { createNewSave, deleteSave, loadSave } from '../../services/storage/saveService';
import { forceCloudSave } from '../../services/supabase/cloudSaveService';
import { ensureGuestSession, finishPermanentAccount, getAccountStatus, requestGuestAccountLink, type AccountStatus } from '../../services/supabase/authService';
import type { CameraZoom, EmployeeQualification, FleetEmployee, FleetPreparationQuote, FleetVehicle, HudSnapshot, Quality, TrafficDensity, VehicleModel } from '../../types/game';
import { MobileControls } from './MobileControls';
import { BUS_LINES } from '../../game/bus/BusTransitConfig';
import { projectOverviewPoint } from '../../map/overview/OverviewProjection';

const emptyGoals = { firstRide: false, fiveRides: false, collisionFreeRide: false, firstTip: false, firstRefuel: false, firstWorkshop: false, firstUpgrade: false, rating45: false, tenKm: false, thousandReais: false };
const emptyUpgrades = { engine: 0, brakes: 0, tires: 0, suspension: 0, economy: 0, comfort: 0 };
const emptySave = createNewSave();
const initialHud: HudSnapshot = {
  ready: false,
  settings: { quality: 'automatic', cameraMode: 'follow', audio: true, masterVolume: 0.7, engineVolume: 0.55, effectsVolume: 0.75, cameraShake: true, cameraZoom: 'normal', trafficDensity: 'automatic', showPlayerNames: true, showFleetNames: true, showPlayersOnMap: true, remoteSounds: true, onlineVisualLimit: 24, publicPresence: true, reducedWorldEffects: false },
  gameplaySpeedMultiplier: GAME_CONFIG.gameplay.speedMultiplier,
  worldClock: { gameMinute: 390, formattedTime: '06:30', period: 'amanhecer', periodLabel: 'Amanhecer', trafficMultiplier: 0.6, passengerDemandBonus: 0, directionalFlow: 'balanced', daylight: 0.8, darkness: 0.2, warmth: 0.7, headlights: 0, synchronized: false },
  money: 100, speedKmh: 0, fuel: 18, fuelCapacity: 40, condition: 70, objective: 'Carregando o mapa de Brasília…',
  distanceRemaining: 0, etaSeconds: 0, headingDelta: 0, vehicleHeading: 0, fps: 0, redLightWarning: false,
  trafficVehicles: 0, trafficBuses: 0, trafficStunned: 0, trafficGhosted: 0, autopilotDeadlockRecoveries: 0,
  collisionEvents: 0, collisionSeverity: null, collisionRelativeSpeedKmh: 0, autopilotEnabled: false, autopilotSportMode: false,
  autopilotNextMissionSeconds: 0, autopilotRoadCorrections: 0, autopilotMinRoadClearance: 0, simulationSeconds: 0,
  autopilotCollisionRecovery: false, autoBrakeReason: 'clear', autopilotState: 'off', autopilotTargetSpeedKmh: 0,
  trafficStopReason: 'Livre', repositionProgress: 0, routeRecalculations: 0, mission: null, receipt: null,
  ledger: [], debts: 0, upgrades: emptyUpgrades, maintenanceWear: 0, collisionDamage: 30, totalKm: 0,
  totalEarned: 0, totalSpent: 0, tipsEarned: 0, driverLevel: 1, rating: 5, completedRides: 0, goals: emptyGoals, regularizationReady: false,
  nearbyService: null, selectedService: null, airTraffic: 0, trafficCapacity: 0,
  trafficHardCeiling: GAME_CONFIG.traffic.maximumTerrestrialEntities, trafficReservedSlots: 0, serviceLocations: [], taxiPoints: [],
  professionalStatus: emptySave.professionalStatus, taxiLicense: emptySave.taxiLicense, taxiMeter: emptySave.taxiMeter,
  officialTaxiRides: 0, activeVehicleId: emptySave.activeVehicleId, viewedVehicleId: null, temporaryVehicleControl: null, pendingFleetPreparation: null, fleet: emptySave.fleet, businesses: emptySave.businesses, busOperation: emptySave.busOperation,
  fleetVehicleVisible: false, fleetRouteTarget: null, fleetRouteRemaining: 0, fleetRoutePathRemaining: 0,
  fleetCompletedStops: 0, fleetRouteRecoveries: 0, fleetLastRecoveryReason: null,
  fleetDriverIdentification: null, totalTerrestrialEntities: 1,
  mapVersion: GAME_CONFIG.mapVersion, currentRegion: 'Setores Centrais', currentAddress: 'Preparando localização…', currentChunk: '0_0', loadedMapChunks: 0, mapRegions: [],
  regionCatalog: [], preferredRegionId: 'any', currentRegionId: 'centro', regionalFamiliarity: {},
  overviewMap: { cityId: 'brasilia', imageUrl: `${import.meta.env.BASE_URL}data/cities/brasilia/overview-map.webp`, bounds: { minX: -7180, minY: -11800, maxX: 15030, maxY: 10975 }, markers: [] },
  online: { mode: 'online', state: 'OFFLINE', accountLinkState: 'local', publicSessionId: null, nearbyPlayers: 0, remoteEmployees: 0, offlineDeployments: 0, pingMs: null, quality: 'offline', subscribedTopics: [], sendRateHz: 0, receiveRateHz: 0, sequence: 0, interpolationBuffer: 0, extrapolating: 0, lostPackets: 0, outOfOrderPackets: 0, npcReplacements: 0, reconnectAttempts: 0, warning: null }
};

type Panel = 'rides' | 'garage' | 'fleet' | 'map' | 'city' | 'service' | 'settings' | 'cash' | null;
type FleetSection = 'overview' | 'vehicles' | 'employees' | 'garages' | 'transfers' | 'training';
type FleetNavigation = { section: FleetSection; vehicleId: string | null; employeeId: string | null; garageId: string | null };

let rememberedFleetNavigation: FleetNavigation = {
  section: 'overview', vehicleId: null, employeeId: null, garageId: null
};

type GarageSection = 'owned' | 'catalog' | 'upgrades';
type GarageCategory = 'passageiros' | 'entregas' | 'carga' | 'motos' | 'ônibus';
let rememberedGarageNavigation: { section: GarageSection; category: GarageCategory } = { section: 'owned', category: 'passageiros' };

const PASSENGER_MODELS: VehicleModel[] = ['Sedan 2012', 'Compacto 2010', 'Sedan Executivo 2018', 'SUV Urbano 2020'];
const DELIVERY_MODELS: VehicleModel[] = ['Moto Urbana 125', 'Moto Cargo 160', 'Scooter Express 150', 'Triciclo Cargo 200', 'Hatch Entrega'];
const FREIGHT_MODELS: VehicleModel[] = ['Furgão Compacto', 'Van de Carga', 'Picape Leve', 'Furgão Médio', 'Utilitário Baú'];
const BUS_MODELS: VehicleModel[] = ['Micro-ônibus Urbano', 'Ônibus Urbano Convencional'];

export function Hud() {
  const [hud, setHud] = useState(initialHud);
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<{ message: string; tone?: string } | null>(null);
  const [paused, setPaused] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => gameEvents.on('hud', setHud), []);
  useEffect(() => gameEvents.on('toast', (next) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 3_200);
  }), []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setDevOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const togglePause = () => { gameEvents.emit('command', { type: 'pause' }); setPaused((value) => !value); };
  const choosePanel = (next: Panel) => setPanel((current) => current === next ? null : next);
  const eta = hud.etaSeconds < 60 ? `${Math.max(1, Math.round(hud.etaSeconds))} s` : `${Math.round(hud.etaSeconds / 60)} min`;
  const fuelPercent = hud.fuel / hud.fuelCapacity * 100;
  const activeVehicle = hud.fleet.vehicles.find((vehicle) => vehicle.id === hud.activeVehicleId);

  return (
    <div className="hud" data-game-ready={hud.ready ? 'true' : 'false'} data-vehicle-name={hud.ready ? activeVehicle?.model ?? 'Hatch 1998' : ''}
      data-speed-kmh={hud.speedKmh.toFixed(2)} data-fps={hud.fps} data-vehicle-heading={hud.vehicleHeading.toFixed(4)}
      data-traffic-vehicles={hud.trafficVehicles} data-traffic-capacity={hud.trafficCapacity} data-traffic-buses={hud.trafficBuses}
      data-traffic-stunned={hud.trafficStunned} data-traffic-ghosted={hud.trafficGhosted}
      data-autopilot-deadlock-recoveries={hud.autopilotDeadlockRecoveries} data-collision-events={hud.collisionEvents}
      data-collision-severity={hud.collisionSeverity ?? 'none'} data-collision-relative-speed-kmh={hud.collisionRelativeSpeedKmh.toFixed(2)}
      data-autopilot-enabled={hud.autopilotEnabled ? 'true' : 'false'} data-autopilot-sport={hud.autopilotSportMode ? 'true' : 'false'} data-autopilot-next-mission-seconds={hud.autopilotNextMissionSeconds}
      data-autopilot-road-corrections={hud.autopilotRoadCorrections} data-autopilot-min-road-clearance={hud.autopilotMinRoadClearance.toFixed(3)}
      data-simulation-seconds={hud.simulationSeconds.toFixed(3)} data-autopilot-collision-recovery={hud.autopilotCollisionRecovery ? 'true' : 'false'}
      data-auto-brake-reason={hud.autoBrakeReason} data-autopilot-state={hud.autopilotState}
      data-autopilot-target-speed-kmh={hud.autopilotTargetSpeedKmh.toFixed(2)} data-route-recalculations={hud.routeRecalculations}
      data-fuel={hud.fuel.toFixed(3)} data-condition={hud.condition.toFixed(2)} data-driver-level={hud.driverLevel}
      data-regularization-ready={hud.regularizationReady ? 'true' : 'false'} data-air-traffic={hud.airTraffic}
      data-selected-service={hud.selectedService?.id ?? 'none'} data-nearby-service={hud.nearbyService?.id ?? 'none'}
      data-ledger-count={hud.ledger.length} data-debts={hud.debts.toFixed(2)}
      data-professional-status={hud.professionalStatus} data-taxi-license={hud.taxiLicense.status}
      data-taxi-meter-state={hud.taxiMeter.state} data-taxi-meter-value={hud.taxiMeter.currentFare.toFixed(2)}
      data-official-taxi-rides={hud.officialTaxiRides} data-fleet-vehicles={hud.fleet.vehicles.length}
      data-fleet-employees={hud.fleet.employees.length} data-fleet-shift={hud.fleet.activeShift?.state ?? 'none'}
      data-fleet-vehicle-visible={hud.fleetVehicleVisible ? 'true' : 'false'} data-terrestrial-entities={hud.totalTerrestrialEntities}
      data-traffic-reserved-slots={hud.trafficReservedSlots} data-fleet-driver-identification={hud.fleetDriverIdentification ?? 'none'}
      data-fleet-route-target={hud.fleetRouteTarget ? `${hud.fleetRouteTarget.x.toFixed(2)},${hud.fleetRouteTarget.y.toFixed(2)}` : 'none'}
      data-fleet-route-remaining={hud.fleetRouteRemaining.toFixed(2)} data-fleet-route-path-remaining={hud.fleetRoutePathRemaining.toFixed(2)}
      data-fleet-completed-stops={hud.fleetCompletedStops} data-fleet-route-recoveries={hud.fleetRouteRecoveries}
      data-fleet-last-recovery={hud.fleetLastRecoveryReason ?? 'none'} data-map-version={hud.mapVersion}
      data-current-region={hud.currentRegion} data-current-chunk={hud.currentChunk} data-loaded-map-chunks={hud.loadedMapChunks}
      data-online-state={hud.online.state} data-online-mode={hud.online.mode} data-online-nearby-players={hud.online.nearbyPlayers}
      data-online-remote-employees={hud.online.remoteEmployees} data-online-session={hud.online.publicSessionId ?? 'none'}
      data-online-send-rate={hud.online.sendRateHz} data-online-receive-rate={hud.online.receiveRateHz}
      data-online-npc-replacements={hud.online.npcReplacements} data-online-channels={hud.online.subscribedTopics.length}
      data-world-minute={hud.worldClock.gameMinute.toFixed(3)} data-world-time={hud.worldClock.formattedTime}
      data-world-period={hud.worldClock.period} data-world-traffic-multiplier={hud.worldClock.trafficMultiplier.toFixed(3)}
      data-world-demand-bonus={hud.worldClock.passengerDemandBonus.toFixed(3)} data-world-flow={hud.worldClock.directionalFlow}
      data-world-darkness={hud.worldClock.darkness.toFixed(3)} data-world-headlights={hud.worldClock.headlights.toFixed(3)}
      data-gameplay-speed={hud.gameplaySpeedMultiplier}
    >
      <div className="world-cycle-overlay" aria-hidden="true" style={{
        background: `linear-gradient(rgba(232, 132, 65, ${hud.worldClock.warmth * 0.1}), rgba(7, 18, 43, ${hud.worldClock.darkness * (hud.settings.reducedWorldEffects ? 0.19 : 0.28)}))`
      }} />
      <header className="top-hud">
        <div className="brand-chip"><span>RB</span><div><b>Brasília</b><small>{hud.currentAddress} • {hud.worldClock.periodLabel}</small></div></div>
        <div className="status-cluster">
          <div className="world-rhythm-chip" title="O deslocamento e os timers do mundo avançam em ritmo acelerado">Ritmo do mundo: <b>{hud.gameplaySpeedMultiplier}×</b></div>
          <div className="world-clock-chip" title={hud.worldClock.synchronized ? 'Sincronizado com o mundo online' : 'Relógio local aguardando sincronização'}><small>HORÁRIO</small><strong>{hud.worldClock.formattedTime}</strong><em>{hud.worldClock.periodLabel}</em></div>
          <button className="money" onClick={() => choosePanel('cash')}><small>CAIXA</small><strong>{formatCurrency(hud.money)}</strong>{hud.debts > 0 && <em>Dívida {formatCurrency(hud.debts)}</em>}</button>
          <div className="vehicle-vitals">
            <button title="Traçar rota ao posto mais próximo" onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'fuel' })} data-testid="fuel-vital-button"><span className="vital-icon">⛽</span><b>{hud.fuel.toFixed(1)} L</b><i><em className={fuelPercent <= 10 ? 'critical' : ''} style={{ width: `${fuelPercent}%` }} /></i></button>
            <button title="Traçar rota à oficina mais próxima" onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'workshop' })} data-testid="repair-vital-button"><span className="vital-icon">◆</span><b>{Math.round(hud.condition)}%</b><i><em className="condition" style={{ width: `${hud.condition}%` }} /></i></button>
          </div>
          <button className="icon-button" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>{paused ? '▶' : 'Ⅱ'}</button>
          <button className="icon-button" onClick={() => gameEvents.emit('command', { type: 'camera' })} aria-label="Alternar câmera">⌁</button>
          <button className="icon-button" onClick={() => choosePanel('settings')} aria-label="Configurações">⚙</button>
        </div>
      </header>
      <OnlineBadge hud={hud} />
      {(hud.online.accountLinkState === 'anonymous' || hud.online.accountLinkState === 'pending-email') && <button className="guest-account-notice" onClick={() => setPanel('settings')}>{hud.online.accountLinkState === 'pending-email' ? 'Confirme seu e-mail para concluir a proteção do progresso.' : 'Conta de visitante. Vincule um e-mail para não perder seu progresso.'}</button>}

      <section className="objective-card" data-testid="objective-card"><div className="objective-icon" style={{ transform: `rotate(${hud.headingDelta}rad)` }}>↑</div><div><small>OBJETIVO ATUAL</small><strong>{hud.objective}</strong><span>{hud.distanceRemaining < 1_000 ? `${Math.round(hud.distanceRemaining)} m` : `${(hud.distanceRemaining / 1000).toFixed(1)} km`} • aprox. {eta}</span></div></section>
      <div className="speedometer" data-testid="speedometer"><strong>{Math.round(hud.speedKmh)}</strong><span>km/h</span><small>{hud.speedKmh < 1 ? 'P' : 'D'}</small></div>
      {activeVehicle?.taxiLicensed && <TaxiMeter hud={hud} />}
      {hud.busOperation.status !== 'idle' && <BusOperationHud hud={hud} />}
      {hud.mission?.phase === 'offered' && !panel && <RideOfferCard hud={hud} />}
      {fuelPercent <= 25 && <button className={`fuel-warning ${fuelPercent <= 5 ? 'critical' : ''}`} data-testid="fuel-route-alert" onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'fuel' })}>COMBUSTÍVEL {fuelPercent <= 5 ? 'CRÍTICO' : fuelPercent <= 10 ? 'BAIXO' : 'EM 25%'} • IR AO POSTO</button>}
      {hud.condition <= 50 && <button className="repair-warning" data-testid="repair-route-alert" onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'workshop' })}>REPARO NECESSÁRIO • IR À OFICINA</button>}
      {hud.fleet.lastReport && !hud.fleet.lastReport.acknowledged && !panel && <button className="fleet-report-alert" onClick={() => choosePanel('fleet')}>RELATÓRIO DA FROTA • {formatCurrency(hud.fleet.lastReport.netProfit)}</button>}
      {hud.nearbyService && !panel && <button className="service-nearby" data-testid="open-service-panel" onClick={() => choosePanel('service')}>{hud.nearbyService.gameName} • abrir atendimento</button>}
      {import.meta.env.DEV && <div className="fps">{hud.fps} FPS • {hud.trafficVehicles} NPCs</div>}
      <div className="map-attribution">© OpenStreetMap contributors • ODbL</div>
      {hud.redLightWarning && <div className="red-warning">SINAL VERMELHO • MULTA APLICADA</div>}
      {hud.collisionSeverity && hud.collisionSeverity !== 'contact' && <div className={`impact-warning ${hud.collisionSeverity}`}>IMPACTO {hud.collisionSeverity.toUpperCase()} • {Math.round(hud.collisionRelativeSpeedKmh)} KM/H RELATIVOS</div>}
      {hud.repositionProgress > 0 && <div className="reposition-progress"><span style={{ width: `${hud.repositionProgress * 100}%` }} />Segure R para reposicionar</div>}
      {!hud.ready && <div className="loading-pill"><i /> Preparando as ruas de Brasília…</div>}
      {toast && <div className={`toast ${toast.tone ?? 'info'}`}>{toast.message}</div>}
      {panel && <PanelContent panel={panel} hud={hud} close={() => setPanel(null)} openPanel={setPanel} />}
      {hud.pendingFleetPreparation && <FleetPreparationDialog quote={hud.pendingFleetPreparation} />}

      {!panel && <div className={`autopilot-controls ${hud.autopilotEnabled ? 'active' : ''}`}>
        <button className={`autopilot-toggle ${hud.autopilotEnabled ? 'active' : ''}`} onClick={() => gameEvents.emit('command', { type: 'autopilot' })}
          aria-pressed={hud.autopilotEnabled} data-testid="autopilot-button"><span>{hud.autopilotEnabled ? '●' : '◎'}</span><b>{hud.autopilotEnabled ? 'Piloto ligado' : 'Piloto automático'}</b>{hud.autopilotEnabled && <small>{autopilotStatus(hud)} • alvo {Math.round(hud.autopilotTargetSpeedKmh)} km/h</small>}</button>
        <button className={`sport-toggle ${hud.autopilotSportMode ? 'active' : ''}`} onClick={() => gameEvents.emit('command', { type: 'toggle-autopilot-sport' })}
          aria-pressed={hud.autopilotSportMode} data-testid="sport-mode-button"><span>⚡</span><b>Modo Sport</b><small>{hud.autopilotSportMode ? '+18% consumo' : 'velocidade máx.'}</small></button>
      </div>}
      <nav className="bottom-nav" aria-label="Navegação principal">
        <button className={!panel ? 'active' : ''} onClick={() => setPanel(null)}><span>◉</span>Dirigir</button>
        <button className={panel === 'rides' ? 'active' : ''} onClick={() => choosePanel('rides')} data-testid="rides-button"><span>▣</span>Corridas</button>
        <button className={panel === 'garage' ? 'active' : ''} onClick={() => choosePanel('garage')} data-testid="garage-button"><span>⌂</span>Garagem</button>
        <button className={panel === 'fleet' ? 'active' : ''} onClick={() => choosePanel('fleet')} data-testid="fleet-button"><span>◆</span>Minha Frota</button>
        <button className={panel === 'map' ? 'active' : ''} onClick={() => choosePanel('map')} data-testid="map-button"><span>⌖</span>Mapa</button>
        <button className={panel === 'cash' ? 'active' : ''} onClick={() => choosePanel('cash')}><span>R$</span>Caixa</button>
        <button className={panel === 'city' ? 'active' : ''} onClick={() => choosePanel('city')} data-testid="city-button"><span>⌖</span>Cidade</button>
      </nav>
      {!hud.autopilotEnabled && <MobileControls />}
      {paused && <button className="pause-overlay" onClick={togglePause}><span>▶</span><b>Continuar viagem</b><small>O jogo está pausado</small></button>}
      {hud.receipt && <ReceiptCard hud={hud} />}
      {devOpen && <DevPanel hud={hud} close={() => setDevOpen(false)} />}
    </div>
  );
}

function OnlineBadge({ hud }: { hud: HudSnapshot }) {
  const online = hud.online;
  const label = online.state === 'ONLINE' ? 'ONLINE' : online.state === 'RECONNECTING' ? 'RECONECTANDO' : online.mode === 'solo' || online.state === 'SOLO' ? 'SOLO' : 'SOLO TEMPORÁRIO';
  return <div className={`online-badge ${online.state.toLowerCase()}`} data-testid="online-badge" title={online.warning ?? undefined}>
    <i /><b>{label}</b>{online.state === 'ONLINE' && <><span>{online.nearbyPlayers} perto</span><span>{online.pingMs ?? '—'} ms</span></>}
  </div>;
}

function FleetPreparationDialog({ quote }: { quote: FleetPreparationQuote }) {
  return <div className="fleet-preparation-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar preparação remota">
    <article className="fleet-preparation-dialog" data-testid="fleet-preparation-dialog">
      <small>PREPARAÇÃO REMOTA</small>
      <h2>Confirmar abastecimento e reparo</h2>
      <p>O funcionário cuidará do veículo e iniciará o turno automaticamente quando tudo estiver pronto.</p>
      <dl>
        <div><dt>Combustível necessário</dt><dd>{quote.requiredFuelLiters.toFixed(1)} L</dd></div>
        <div><dt>Custo do combustível</dt><dd>{formatCurrency(quote.fuelCost)}</dd></div>
        <div><dt>Reparos</dt><dd>{formatCurrency(quote.repairCost)}</dd></div>
        <div><dt>Comodidade (10%, mín. R$ 5)</dt><dd>{formatCurrency(quote.convenienceFee)}</dd></div>
        <div><dt>Tempo de preparo</dt><dd>{Math.max(1, Math.ceil(quote.preparationSeconds / 60))} min de jogo</dd></div>
        <div className="total"><dt>Total</dt><dd>{formatCurrency(quote.total)}</dd></div>
      </dl>
      <div className="assignment-actions">
        <button className="primary-button" data-testid="confirm-fleet-preparation" onClick={() => gameEvents.emit('command', { type: 'confirm-fleet-shift-preparation', employeeId: quote.employeeId, requestId: requestId(`remote-preparation-${quote.vehicleId}`) })}>Confirmar e iniciar</button>
        <button onClick={() => gameEvents.emit('command', { type: 'cancel-fleet-shift-preparation' })}>Cancelar</button>
      </div>
    </article>
  </div>;
}

function TaxiMeter({ hud }: { hud: HudSnapshot }) {
  const meter = hud.taxiMeter;
  const labels = { free: 'LIVRE', 'en-route': 'A CAMINHO', boarding: 'EMBARQUE', occupied: 'OCUPADO', waiting: 'AGUARDANDO', finished: 'FINALIZADO' } as const;
  const running = meter.state === 'occupied' || meter.state === 'waiting' || meter.state === 'finished';
  const detail = meter.state === 'free' ? 'Aceite uma corrida oficial'
    : meter.state === 'en-route' || meter.state === 'boarding' ? 'Inicia depois do embarque'
      : `${(meter.distanceMeters / 1_000).toFixed(2)} km • ${Math.floor(meter.elapsedSeconds / 60)}:${String(Math.floor(meter.elapsedSeconds % 60)).padStart(2, '0')}`;
  return <section className={`taxi-meter ${meter.state}`} data-testid="taxi-meter" data-meter-fare={meter.currentFare.toFixed(2)}><small>TAXÍMETRO • VALORES DE GAMEPLAY</small><b>{labels[meter.state]}</b><strong>{running ? formatCurrency(meter.currentFare) : '—'}</strong><span>{detail}</span></section>;
}

function BusOperationHud({ hud }: { hud: HudSnapshot }) {
  const operation = hud.busOperation;
  const line = BUS_LINES.find((item) => item.id === operation.lineId);
  return <section className="taxi-meter bus-operation" data-testid="bus-operation-hud">
    <small>LINHA {line?.publicCode ?? '—'} • {operation.status === 'at-stop' ? 'NA PARADA' : operation.status === 'completed' ? 'CONCLUÍDA' : 'EM OPERAÇÃO'}</small>
    <b>{operation.nextStopName ?? line?.name ?? 'Operação finalizada'}</b>
    <strong>{operation.occupancy}/{operation.capacity}</strong>
    <span>{operation.doors === 'open' ? 'PORTAS ABERTAS' : 'PORTAS FECHADAS'} • receita {formatCurrency(operation.grossRevenue)} • recusados {operation.refused}{operation.dwellRemainingSeconds > 0 ? ` • embarque ${Math.ceil(operation.dwellRemainingSeconds)}s` : ''}</span>
    {operation.status === 'at-stop' && operation.doors === 'closed' && <button onClick={() => gameEvents.emit('command', { type: 'service-bus-stop' })}>Abrir portas e embarcar</button>}
    {operation.status === 'at-stop' && operation.doors === 'open' && <button disabled={operation.dwellRemainingSeconds > 0} onClick={() => gameEvents.emit('command', { type: 'depart-bus-stop' })}>Fechar portas e partir</button>}
  </section>;
}

function RideOfferCard({ hud }: { hud: HudSnapshot }) {
  const mission = hud.mission!;
  const quote = mission.quote;
  const official = mission.rideMode === 'official-taxi';
  const pickupRegion = hud.regionCatalog.find((region) => region.id === mission.pickupRegionId)?.name ?? mission.region;
  const destinationRegion = hud.regionCatalog.find((region) => region.id === mission.destinationRegionId)?.name ?? mission.region;
  return <section className="ride-offer" data-testid="ride-offer"><div><small>{official ? 'TÁXI OFICIAL' : categoryLabel(mission.category)} • {mission.regionalCategory ?? 'regional'}</small><b>{mission.passengerName}</b><span>{pickupRegion} → {destinationRegion}</span><em>{mission.pickupLabel} → {mission.destinationLabel}</em><em>Busca {mission.pickupDistanceKm?.toFixed(1) ?? '—'} km • viagem {((mission.routeDistanceMeters ?? 0) / 1_000 || quote?.estimatedDistanceKm)?.toFixed(1)} km • {quote?.estimatedMinutes.toFixed(0)} min</em><em>Demanda {mission.demandLevel ?? 'normal'} • {mission.familiarityLevel ?? 'região nova'} • combustível recomendado {mission.recommendedFuelLiters?.toFixed(1) ?? '—'} L</em>{(mission.peakDemandBonusPercent ?? 0) > 0 && <em className="peak-demand-bonus">Demanda de horário de pico: +{mission.peakDemandBonusPercent}%</em>}<em>{mission.requirements?.join(' • ')} • {official ? 'estimativa' : 'garantido'} {formatCurrency(quote?.guaranteedTotal ?? 0)}</em></div><button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'accept-ride' })}>Aceitar</button><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'reject-ride' })}>Recusar</button></section>;
}

function PanelContent({ panel, hud, close, openPanel }: { panel: Exclude<Panel, null>; hud: HudSnapshot; close: () => void; openPanel: (panel: Panel) => void }) {
  const [confirmation, setConfirmation] = useState<{ label: string; command: GameCommand } | null>(null);
  const confirm = (label: string, command: GameCommand) => setConfirmation({ label, command });
  const execute = () => { if (confirmation) gameEvents.emit('command', confirmation.command); setConfirmation(null); };
  return <aside className={`game-panel ${panel === 'map' ? 'overview-map-panel' : ''}`}><button className="panel-close" onClick={close} aria-label="Fechar">×</button>
    {panel === 'rides' && <><RidesPanel hud={hud} /><CommercialWorkActions hud={hud} /></>}
    {panel === 'garage' && <GaragePanel hud={hud} confirm={confirm} close={close} openPanel={openPanel} />}
    {panel === 'fleet' && <FleetPanel hud={hud} confirm={confirm} close={close} />}
    {panel === 'map' && <OverviewMapPanel hud={hud} close={close} openPanel={openPanel} />}
    {panel === 'city' && <ServicesPanel hud={hud} confirm={confirm} />}
    {panel === 'service' && <ServiceOperationPanel hud={hud} confirm={confirm} />}
    {panel === 'cash' && <CashPanel hud={hud} confirm={confirm} />}
    {panel === 'settings' && <><SettingsPanel hud={hud} /><WorldEffectsSettings hud={hud} /><AccountSettingsPanel hud={hud} /><OnlineSettingsPanel hud={hud} /></>}
    {confirmation && <div className="confirm-strip"><b>Confirmar {confirmation.label}?</b><button className="primary-button" onClick={execute}>Confirmar</button><button className="ghost-button" onClick={() => setConfirmation(null)}>Voltar</button></div>}
  </aside>;
}

function OverviewMapPanel({ hud, close, openPanel }: { hud: HudSnapshot; close: () => void; openPanel: (panel: Panel) => void }) {
  const [visible, setVisible] = useState({ player: true, employee: true, fleet: true, online: true, garage: true });
  const [selectedId, setSelectedId] = useState('player-current');
  const markers = hud.overviewMap.markers.filter((marker) => visible[marker.kind]);
  const selected = hud.overviewMap.markers.find((marker) => marker.id === selectedId) ?? markers[0];
  const toggle = (kind: keyof typeof visible) => setVisible((current) => ({ ...current, [kind]: !current[kind] }));
  const showAll = () => setVisible({ player: true, employee: true, fleet: true, online: true, garage: true });
  const centerFleet = () => setSelectedId(hud.overviewMap.markers.find((marker) => marker.kind === 'employee' || marker.kind === 'fleet')?.id ?? 'player-current');
  return <>
    <div className="panel-kicker">MAPA GERAL</div><h2>Brasília • frota e jogadores</h2>
    <div className="overview-map-layout" data-testid="overview-map">
      <aside className="overview-map-filters">
        <b>EXIBIR</b>
        {([['player','Meu veículo','●'],['employee','Funcionários','◆'],['fleet','Minha frota','○'],['online','Jogadores online','▲'],['garage','Garagens','■']] as const).map(([kind, label, icon]) => <label className={`overview-legend ${kind}`} key={kind}><input type="checkbox" checked={visible[kind]} onChange={() => toggle(kind)} /><i>{icon}</i> {label}</label>)}
        <button onClick={showAll}>Mostrar tudo</button>
        <button onClick={() => setSelectedId('player-current')}>Centralizar em mim</button>
        <button onClick={centerFleet}>Centralizar na frota</button>
      </aside>
      <div className="overview-map-canvas">
        <img src={hud.overviewMap.imageUrl} loading="lazy" decoding="async" alt="Mapa simplificado de Brasília com vias principais, regiões e Lago Paranoá" />
        <div className="overview-map-marker-layer">{markers.map((marker) => {
          const point = projectOverviewPoint(marker.position, hud.overviewMap.bounds);
          return <button key={marker.id} className={`overview-marker ${marker.kind} ${selected?.id === marker.id ? 'selected' : ''}`} style={{ left: `${point.left}%`, top: `${point.top}%` }} onClick={() => setSelectedId(marker.id)} title={`${marker.label} • ${marker.status}`} aria-label={`${marker.label}, ${marker.status}`}><i />{selected?.id === marker.id && <span>{marker.label}</span>}</button>;
        })}</div>
      </div>
      {selected && <article className="overview-marker-detail" data-testid="overview-marker-detail"><small>{selected.kind.toUpperCase()}</small><b>{selected.label}</b><span>{selected.detail}</span><em>{selected.status}</em>{selected.meta?.map((line) => <span key={line}>{line}</span>)}<div className="assignment-actions">{selected.vehicleId && selected.kind !== 'player' && <button onClick={() => { gameEvents.emit('command', { type: 'view-fleet-vehicle', vehicleId: selected.vehicleId! }); close(); }}>Visualizar carro</button>}{selected.vehicleId && (selected.kind === 'employee' || selected.kind === 'fleet') && <button className="primary-button" onClick={() => { gameEvents.emit('command', { type: 'assume-fleet-vehicle', vehicleId: selected.vehicleId! }); close(); }}>Assumir direção</button>}{selected.employeeId && <button onClick={() => { rememberedFleetNavigation = { ...rememberedFleetNavigation, section: 'employees', employeeId: selected.employeeId!, vehicleId: selected.vehicleId ?? null }; openPanel('fleet'); }}>Ver funcionário</button>}<button onClick={() => setSelectedId('player-current')}>Voltar ao mapa</button></div></article>}
    </div>
    <p className="overview-map-source">Imagem estática otimizada • OpenStreetMap contributors • ODbL. Apenas os marcadores são atualizados.</p>
  </>;
}

function RidesPanel({ hud }: { hud: HudSnapshot }) {
  const mission = hud.mission;
  const official = mission?.rideMode === 'official-taxi';
  return <><div className="panel-kicker">CORRIDAS</div><h2>{mission?.phase === 'offered' ? 'Nova oferta' : mission?.passengerName ?? 'Procurando passageiro'}</h2>
    {hud.professionalStatus === 'licensed-taxi' && <div className="taxi-status-line">Táxi regularizado • {hud.officialTaxiRides} corridas oficiais</div>}
    {mission && <><div className="offer-details"><span><small>Modalidade</small><b>{official ? 'Táxi oficial' : 'Informal'}</b></span><span><small>{official ? 'Estimativa' : 'Garantido'}</small><b>{formatCurrency(mission.quote?.guaranteedTotal ?? 0)}</b></span><span><small>Até a busca</small><b>{mission.pickupDistanceKm?.toFixed(1) ?? '—'} km</b></span><span><small>Viagem</small><b>{mission.quote?.estimatedDistanceKm.toFixed(1)} km</b></span><span><small>Prazo</small><b>{Math.round((mission.deadlineSeconds ?? 0) / 60)} min</b></span><span><small>Solicitação</small><b>{taxiRequestLabel(mission.taxiRequestType)}</b></span></div><div className="ride-route"><span>●</span><div><b>{mission.pickupLabel}</b><i /><b>{mission.destinationLabel}</b></div><span>◆</span></div>{mission.phase === 'offered' ? <div className="panel-actions"><button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'accept-ride' })}>Aceitar corrida</button><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'reject-ride' })}>Recusar</button></div> : <button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'cancel-ride' })}>Cancelar corrida</button>}</>}
  </>;
}

function GaragePanel({ hud, confirm, close, openPanel }: { hud: HudSnapshot; confirm: ConfirmFn; close: () => void; openPanel: (panel: Panel) => void }) {
  const [navigation, setNavigation] = useState(() => ({ ...rememberedGarageNavigation }));
  const navigate = (patch: Partial<typeof rememberedGarageNavigation>) => setNavigation((current) => {
    const next = { ...current, ...patch };
    rememberedGarageNavigation = next;
    return next;
  });
  const atGarage = hud.nearbyService?.category === 'garage';
  const active = hud.fleet.vehicles.find((vehicle) => vehicle.id === hud.activeVehicleId);
  const owned = hud.fleet.vehicles.filter((vehicle) => vehicleCategory(vehicle) === navigation.category);
  const delivery = hud.businesses.some((business) => business.kind === 'delivery');
  const freight = hud.businesses.some((business) => business.kind === 'light-freight');
  const bus = hud.businesses.some((business) => business.kind === 'bus');
  const unlocked: Record<GarageCategory, boolean> = {
    passageiros: hud.professionalStatus === 'licensed-taxi', entregas: delivery, motos: delivery, carga: freight, ônibus: bus
  };
  const catalog: Record<GarageCategory, VehicleModel[]> = {
    passageiros: PASSENGER_MODELS, motos: DELIVERY_MODELS.slice(0, 4), entregas: DELIVERY_MODELS.slice(4), carga: FREIGHT_MODELS, ônibus: BUS_MODELS
  };
  const categories: Array<[GarageCategory, string]> = [['passageiros', 'Passageiros'], ['motos', 'Motos'], ['entregas', 'Entregas'], ['carga', 'Carga'], ['ônibus', 'Ônibus']];
  const buy = (model: VehicleModel) => {
    const passenger = PASSENGER_MODELS.includes(model);
    const price = passenger
      ? model === 'Sedan 2012' ? GAME_CONFIG.fleet.secondVehiclePrice : GAME_CONFIG.fleet.passengerVehiclePrices[model as keyof typeof GAME_CONFIG.fleet.passengerVehiclePrices]
      : GAME_CONFIG.fleet.vehiclePrices[model as keyof typeof GAME_CONFIG.fleet.vehiclePrices];
    const command: GameCommand = passenger
      ? { type: 'buy-fleet-vehicle', model: model as 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020', requestId: requestId(`garage-${model}`) }
      : { type: 'purchase-light-vehicle', model: model as Exclude<VehicleModel, 'Hatch 1998' | 'Sedan 2012' | 'Compacto 2010' | 'Sedan Executivo 2018' | 'SUV Urbano 2020'>, garageId: hud.nearbyService!.id, requestId: requestId(`garage-${model}`) };
    confirm(`comprar ${model} por ${formatCurrency(price)}`, command);
  };
  return <><div className="panel-kicker">GARAGEM</div><h2>{active?.model ?? 'Hatch 1998'} • {hud.fleet.vehicles.length} veículos</h2>
    <nav className="fleet-tabs garage-tabs" aria-label="Áreas da garagem">{([['owned','Meus veículos'],['catalog','Comprar'],['upgrades','Melhorias']] as const).map(([section,label]) => <button key={section} className={navigation.section === section ? 'active' : ''} onClick={() => navigate({ section })}>{label}</button>)}</nav>
    {navigation.section !== 'upgrades' && <nav className="garage-category-tabs" aria-label="Categorias de veículos">{categories.map(([category,label]) => <button key={category} className={navigation.category === category ? 'active' : ''} onClick={() => navigate({ category })}><b>{label}</b><small>{hud.fleet.vehicles.filter((vehicle) => vehicleCategory(vehicle) === category).length} próprios{unlocked[category] ? ' • liberado' : ''}</small></button>)}</nav>}
    {navigation.section === 'owned' && <section className="garage-browser"><h3>{categories.find(([id]) => id === navigation.category)?.[1]} próprios</h3><div className="fleet-vehicle-list">{owned.map((vehicle) => { const employee = hud.fleet.employees.find((item) => item.vehicleId === vehicle.id); const shift = hud.fleet.activeShift?.vehicleId === vehicle.id ? hud.fleet.activeShift : null; return <div key={vehicle.id}><span><b>{vehicle.model}{vehicle.taxiLicensed ? ' • Táxi' : ''}</b><small>{vehicleStateLabel(vehicle.state)} • {vehicle.condition.toFixed(0)}% • {vehicle.fuel.toFixed(1)} L</small></span><span className="garage-vehicle-actions"><button onClick={() => { gameEvents.emit('command', { type: 'view-fleet-vehicle', vehicleId: vehicle.id }); close(); }}>Visualizar carro</button>{vehicle.id === hud.activeVehicleId ? <em>ATIVO</em> : <button onClick={() => { gameEvents.emit('command', { type: 'assume-fleet-vehicle', vehicleId: vehicle.id }); close(); }}>{employee && shift ? 'Assumir direção' : 'Dirigir'}</button>}{employee && <button onClick={() => { rememberedFleetNavigation = { ...rememberedFleetNavigation, section: 'employees', employeeId: employee.id, vehicleId: vehicle.id }; openPanel('fleet'); }}>Ver funcionário</button>}{employee && !shift && <button onClick={() => gameEvents.emit('command', { type: 'start-fleet-shift', employeeId: employee.id, requestId: requestId(`garage-shift-${employee.id}`) })}>Iniciar turno</button>}</span></div>; })}{!owned.length && <p>Nenhum veículo desta categoria na sua frota.</p>}</div></section>}
    {navigation.section === 'catalog' && <section className="garage-browser"><h3>Catálogo • {categories.find(([id]) => id === navigation.category)?.[1]}</h3>{!unlocked[navigation.category] && <div className="garage-locked"><b>Categoria ainda bloqueada</b><small>{navigation.category === 'passageiros' ? 'Conclua a regularização de táxi.' : navigation.category === 'ônibus' ? 'Abra a empresa de transporte coletivo.' : navigation.category === 'carga' ? 'Abra a empresa de frete leve.' : 'Abra a Central de Entregas.'}</small></div>}<div className="garage-catalog-grid">{unlocked[navigation.category] && catalog[navigation.category].map((model) => { const passenger = PASSENGER_MODELS.includes(model); const price = passenger ? model === 'Sedan 2012' ? GAME_CONFIG.fleet.secondVehiclePrice : GAME_CONFIG.fleet.passengerVehiclePrices[model as keyof typeof GAME_CONFIG.fleet.passengerVehiclePrices] : GAME_CONFIG.fleet.vehiclePrices[model as keyof typeof GAME_CONFIG.fleet.vehiclePrices]; return <article key={model}><small>{navigation.category.toUpperCase()}</small><b>{model}</b><span>{formatCurrency(price)}</span><button disabled={!atGarage} onClick={() => buy(model)}>{atGarage ? 'Comprar' : 'Vá a uma garagem'}</button></article>; })}</div></section>}
    {navigation.section === 'upgrades' && <><div className="spec-grid"><span><small>Condição</small><b>{Math.round(hud.condition)}%</b></span><span><small>Desgaste</small><b>{hud.maintenanceWear.toFixed(1)}%</b></span><span><small>Dano de colisão</small><b>{hud.collisionDamage.toFixed(1)}%</b></span><span><small>Tanque</small><b>{hud.fuel.toFixed(1)}/{hud.fuelCapacity} L</b></span></div><div className="upgrade-list">{UPGRADE_IDS.map((id) => { const price = upgradePrice(id, hud.upgrades); const name = ECONOMY_CONFIG.upgrades[id].name; return <div key={id}><span><b>{name}</b><small>Nível {hud.upgrades[id]}/3</small></span><button disabled={!atGarage || price === null} onClick={() => price !== null && confirm(`${name} por ${formatCurrency(price)}`, { type: 'buy-upgrade', upgrade: id, requestId: requestId('upgrade') })}>{price === null ? 'Máximo' : formatCurrency(price)}</button></div>; })}</div></>}
    {!atGarage && <p className="garage-location-note">Visualizar ou assumir veículos próprios está disponível em qualquer lugar. Para comprar ou instalar melhorias, estacione em uma garagem.</p>}
  </>;
}

function FleetPanel({ hud, confirm, close }: { hud: HudSnapshot; confirm: ConfirmFn; close: () => void }) {
  const [navigation, setNavigation] = useState<FleetNavigation>(() => ({ ...rememberedFleetNavigation }));
  const navigate = (patch: Partial<FleetNavigation>) => setNavigation((current) => {
    const next = { ...current, ...patch };
    rememberedFleetNavigation = next;
    return next;
  });
  const sections: Array<[FleetSection, string]> = [
    ['overview', 'Visão geral'], ['vehicles', 'Veículos'], ['employees', 'Funcionários'],
    ['garages', 'Garagens'], ['transfers', 'Transferências'], ['training', 'Treinamentos']
  ];

  return <>
    <div className="panel-kicker">MINHA FROTA</div>
    <h2>{hud.fleet.name} • {hud.fleet.vehicles.length} veículos</h2>
    <nav className="fleet-tabs" aria-label="Áreas da frota">
      {sections.map(([section, label]) => <button key={section} className={navigation.section === section ? 'active' : ''}
        onClick={() => navigate({ section })} data-testid={`fleet-tab-${section}`}>{label}</button>)}
    </nav>
    {navigation.section === 'overview' && <FleetOverview hud={hud} confirm={confirm} navigate={navigate} />}
    {navigation.section === 'vehicles' && <FleetVehicleBrowser hud={hud} navigation={navigation} navigate={navigate} close={close} />}
    {navigation.section === 'employees' && <FleetEmployeeBrowser hud={hud} navigation={navigation} navigate={navigate} confirm={confirm} />}
    {navigation.section === 'garages' && <FleetGarageBrowser hud={hud} navigation={navigation} navigate={navigate} confirm={confirm} />}
    {navigation.section === 'transfers' && <FleetTransfers hud={hud} confirm={confirm} navigate={navigate} />}
    {navigation.section === 'training' && <FleetTraining hud={hud} navigation={navigation} navigate={navigate} confirm={confirm} />}
    {hud.fleet.lastReport && <FleetReport hud={hud} />}
  </>;
}

function FleetOverview({ hud, confirm, navigate }: { hud: HudSnapshot; confirm: ConfirmFn; navigate: (patch: Partial<FleetNavigation>) => void }) {
  const vehicles = hud.fleet.vehicles;
  const employees = hud.fleet.employees;
  const availableVehicles = vehicles.filter((vehicle) => ['available', 'parked'].includes(vehicle.state)).length;
  const operatingVehicles = vehicles.filter((vehicle) => ['employee-driving', 'on-trip', 'returning', 'refueling'].includes(vehicle.state)).length;
  const repairVehicles = vehicles.filter((vehicle) => vehicle.state === 'maintenance' || vehicle.state === 'damaged' || vehicle.condition < 45).length;
  const workingEmployees = employees.filter((employee) => !['available', 'waiting-vehicle', 'resting'].includes(employee.state)).length;
  const recent = hud.ledger.slice(0, 12);
  const income = recent.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const expenses = Math.abs(recent.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0));
  const licensed = hud.professionalStatus === 'licensed-taxi';
  const requirements = [
    [`${GAME_CONFIG.progression.regularization.completedRides} corridas`, hud.completedRides >= GAME_CONFIG.progression.regularization.completedRides],
    [`Nível ${GAME_CONFIG.progression.regularization.driverLevel}`, hud.driverLevel >= GAME_CONFIG.progression.regularization.driverLevel],
    [`Avaliação ${GAME_CONFIG.progression.regularization.rating.toFixed(2)}`, hud.rating >= GAME_CONFIG.progression.regularization.rating],
    [`${GAME_CONFIG.progression.regularization.totalKm} km`, hud.totalKm >= GAME_CONFIG.progression.regularization.totalKm],
    [`Reserva de ${formatCurrency(GAME_CONFIG.progression.regularization.money)}`, hud.money >= GAME_CONFIG.progression.regularization.money]
  ] as const;

  return <div className="fleet-overview" data-testid="fleet-overview">
    <div className="fleet-stat-grid">
      <button onClick={() => navigate({ section: 'vehicles' })}><small>Total</small><b>{vehicles.length}</b><span>veículos</span></button>
      <button onClick={() => navigate({ section: 'vehicles' })}><small>Disponíveis</small><b>{availableVehicles}</b><span>veículos</span></button>
      <button onClick={() => navigate({ section: 'vehicles' })}><small>Operando</small><b>{operatingVehicles}</b><span>veículos</span></button>
      <button onClick={() => navigate({ section: 'vehicles' })}><small>Em reparo</small><b>{repairVehicles}</b><span>veículos</span></button>
      <button onClick={() => navigate({ section: 'employees' })}><small>Disponíveis</small><b>{employees.length - workingEmployees}</b><span>funcionários</span></button>
      <button onClick={() => navigate({ section: 'employees' })}><small>Trabalhando</small><b>{workingEmployees}</b><span>funcionários</span></button>
    </div>
    <section className="fleet-card recent-balance"><b>MOVIMENTAÇÃO RECENTE</b><div><span>Entradas <strong>{formatCurrency(income)}</strong></span><span>Saídas <strong>{formatCurrency(expenses)}</strong></span></div></section>
    <div className="garage-capacity-grid">{hud.fleet.garages.map((garage) => {
      const garageVehicles = vehicles.filter((vehicle) => vehicle.baseGarageId === garage.serviceId).length;
      const garageEmployees = employees.filter((employee) => employee.baseGarageId === garage.serviceId).length;
      return <button key={garage.serviceId} onClick={() => navigate({ section: 'garages', garageId: garage.serviceId })}><b>{garage.name}</b><small>{garageVehicles}/{garage.vehicleCapacity} veículos • {garageEmployees}/{garage.employeeCapacity} funcionários</small></button>;
    })}</div>
    <section className={`regularization ${hud.regularizationReady || licensed ? 'ready' : ''}`} data-testid="regularization-panel">
      <b>{licensed ? 'TAXISTA REGULARIZADO' : hud.regularizationReady ? 'PRONTO PARA REGULARIZAR' : 'REGULARIZAÇÃO EM PROGRESSO'}</b>
      {!licensed && <div className="requirement-list">{requirements.map(([label, complete]) => <span className={complete ? 'done' : ''} key={label}>{complete ? '✓' : '○'} {label}</span>)}</div>}
      {!licensed && <button className="primary-button" disabled={!hud.regularizationReady} onClick={() => confirm(`regularização por ${formatCurrency(GAME_CONFIG.taxi.regularizationCost)}`, { type: 'regularize-taxi', requestId: requestId('regularize') })}>Regularizar • {formatCurrency(GAME_CONFIG.taxi.regularizationCost)}</button>}
    </section>
    {hud.fleet.activeShift && <FleetActiveShiftCard hud={hud} />}
    <BusinessFleetSection hud={hud} confirm={confirm} primaryGarageId={hud.fleet.garages[0]?.serviceId} />
  </div>;
}

function FleetVehicleBrowser({ hud, navigation, navigate, close }: { hud: HudSnapshot; navigation: FleetNavigation; navigate: (patch: Partial<FleetNavigation>) => void; close: () => void }) {
  const [search, setSearch] = useState('');
  const [garageFilter, setGarageFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const filtered = hud.fleet.vehicles.filter((vehicle) => {
    const assigned = hud.fleet.employees.some((employee) => employee.vehicleId === vehicle.id);
    return (!normalized || `${vehicle.model} ${vehicle.id}`.toLocaleLowerCase('pt-BR').includes(normalized))
      && (garageFilter === 'all' || vehicle.baseGarageId === garageFilter)
      && (categoryFilter === 'all' || vehicleCategory(vehicle) === categoryFilter)
      && (stateFilter === 'all' || vehicle.state === stateFilter)
      && (!onlyUnassigned || !assigned);
  });
  const selected = filtered.find((vehicle) => vehicle.id === navigation.vehicleId) ?? filtered[0];
  const filteredIndex = selected ? filtered.findIndex((vehicle) => vehicle.id === selected.id) : -1;
  const select = (vehicleId: string) => navigate({ vehicleId });
  const cycle = (step: number) => {
    if (!filtered.length) return;
    const index = filteredIndex >= 0 ? filteredIndex : 0;
    select(filtered[(index + step + filtered.length) % filtered.length].id);
  };

  return <section className="fleet-vehicle-browser" data-testid="fleet-vehicle-browser">
    <div className="fleet-filter-grid">
      <label className="fleet-search">Buscar por nome ou modelo<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: Sedan" data-testid="fleet-vehicle-search" /></label>
      <label>Garagem<select value={garageFilter} onChange={(event) => setGarageFilter(event.target.value)}><option value="all">Todas</option>{hud.fleet.garages.map((garage) => <option key={garage.serviceId} value={garage.serviceId}>{garage.name}</option>)}</select></label>
      <label>Categoria<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Todas</option><option value="passageiros">Passageiros</option><option value="motos">Motos</option><option value="entregas">Entregas</option><option value="carga">Carga</option><option value="ônibus">Ônibus</option></select></label>
      <label>Estado<select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option value="all">Todos</option>{[...new Set(hud.fleet.vehicles.map((vehicle) => vehicle.state))].map((state) => <option key={state} value={state}>{vehicleStateLabel(state)}</option>)}</select></label>
      <label className="toggle-setting fleet-unassigned"><input type="checkbox" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)} /> Somente veículos sem motorista</label>
    </div>
    <div className="fleet-mobile-selector">
      <select value={selected?.id ?? ''} onChange={(event) => select(event.target.value)}>{filtered.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.model} • {vehicleStateLabel(vehicle.state)}</option>)}</select>
    </div>
    <div className="fleet-cycle-controls"><button onClick={() => cycle(-1)} disabled={filtered.length < 2}>← Veículo anterior</button><b>{filtered.length ? `Veículo ${Math.max(1, filteredIndex + 1)} de ${filtered.length}` : 'Nenhum veículo encontrado'}</b><button onClick={() => cycle(1)} disabled={filtered.length < 2}>Próximo veículo →</button></div>
    <div className="fleet-browser-layout">
      <aside className="fleet-side-list" aria-label="Lista de veículos">{filtered.map((vehicle) => {
        const assigned = hud.fleet.employees.find((employee) => employee.vehicleId === vehicle.id);
        return <button key={vehicle.id} className={selected?.id === vehicle.id ? 'active' : ''} onClick={() => select(vehicle.id)}><b>{vehicle.model}</b><small>{vehicleStateLabel(vehicle.state)} • {vehicle.condition.toFixed(0)}%</small><span>{assigned?.name ?? 'Sem motorista'}</span></button>;
      })}</aside>
      <div className="fleet-detail-panel">{selected ? <FleetVehicleDetail hud={hud} vehicle={selected} navigate={navigate} close={close} /> : <p>Nenhum veículo corresponde à busca e aos filtros.</p>}</div>
    </div>
  </section>;
}

function FleetVehicleDetail({ hud, vehicle, navigate, close }: { hud: HudSnapshot; vehicle: FleetVehicle; navigate: (patch: Partial<FleetNavigation>) => void; close: () => void }) {
  const employee = hud.fleet.employees.find((item) => item.vehicleId === vehicle.id || item.id === vehicle.controllerId);
  const garage = hud.fleet.garages.find((item) => item.serviceId === vehicle.baseGarageId);
  const shift = hud.fleet.activeShift?.vehicleId === vehicle.id ? hud.fleet.activeShift : null;
  const availableEmployees = hud.fleet.employees.filter((item) => !hud.fleet.activeShift || hud.fleet.activeShift.employeeId === item.id)
    .filter((item) => canEmployeeDrive(item, vehicle));
  const startAllowed = employee && !hud.fleet.activeShift && vehicle.id !== hud.activeVehicleId;

  return <article className="vehicle-detail-card" data-testid="selected-fleet-vehicle" data-vehicle-id={vehicle.id}>
    <header><div><small>{vehicleCategory(vehicle).toUpperCase()}</small><h3>{vehicle.model}</h3><span>Identificação {vehicle.id.slice(-8).toUpperCase()}</span></div><em>{vehicleStateLabel(vehicle.state)}</em></header>
    <div className="vehicle-vitals"><span><small>Garagem</small><b>{garage?.name ?? 'Sem base'}</b></span><span><small>Condição</small><b>{vehicle.condition.toFixed(0)}%</b><i><em style={{ width: `${vehicle.condition}%` }} /></i></span><span><small>Combustível</small><b>{vehicle.fuel.toFixed(1)}/{vehicle.fuelCapacity} L</b><i><em style={{ width: `${vehicle.fuel / vehicle.fuelCapacity * 100}%` }} /></i></span><span><small>Operação</small><b>{shift ? employeeStateLabel(shift.state) : vehicleStateLabel(vehicle.state)}</b></span></div>
    {garage && <button className="direct-link" onClick={() => navigate({ section: 'garages', garageId: garage.serviceId })}>Ver garagem • {garage.name}</button>}
    <div className="vehicle-control-actions"><button onClick={() => { gameEvents.emit('command', { type: 'view-fleet-vehicle', vehicleId: vehicle.id }); close(); }}>Visualizar carro</button>{shift && !hud.temporaryVehicleControl && <button className="primary-button" onClick={() => { gameEvents.emit('command', { type: 'assume-fleet-vehicle', vehicleId: vehicle.id }); close(); }}>Assumir direção</button>}{hud.temporaryVehicleControl?.vehicleId === vehicle.id && <button className="primary-button" onClick={() => { gameEvents.emit('command', { type: 'return-fleet-vehicle' }); close(); }}>Devolver ao funcionário</button>}</div>
    {employee ? <section className="assigned-employee"><span className="candidate-avatar">{employee.avatar}</span><div><small>FUNCIONÁRIO ATRIBUÍDO</small><b>{employeeIdentification(employee.name)}</b><span>{employee.qualifications.map(qualificationLabel).join(' • ')}</span><em>{employeeStateLabel(employee.state)}</em></div><button onClick={() => navigate({ section: 'employees', employeeId: employee.id, vehicleId: vehicle.id })}>Ver funcionário</button></section> : <section className="unassigned-driver" data-testid="vehicle-without-employee"><b>Sem funcionário atribuído</b><p>Escolha alguém disponível, contrate um novo funcionário ou abra os treinamentos exigidos pelo modelo.</p></section>}
    {!employee && vehicle.id !== hud.activeVehicleId && <div className="assignment-actions">{availableEmployees.map((item) => <button key={item.id} onClick={() => gameEvents.emit('command', { type: 'assign-employee', employeeId: item.id, vehicleId: vehicle.id })}>Atribuir {item.name}</button>)}<button onClick={() => navigate({ section: 'employees' })}>Contratar novo funcionário</button><button onClick={() => navigate({ section: 'training', employeeId: hud.fleet.employees[0]?.id ?? null })}>Treinar funcionário, se necessário</button></div>}
    {employee && !shift && <div className="assignment-actions"><button disabled={!startAllowed} className="primary-button" onClick={() => gameEvents.emit('command', { type: 'start-fleet-shift', employeeId: employee.id, requestId: requestId(`shift-${employee.id}`) })}>Iniciar turno</button><button onClick={() => gameEvents.emit('command', { type: 'unassign-employee', employeeId: employee.id })}>Remover motorista</button>{availableEmployees.filter((item) => item.id !== employee.id).map((item) => <button key={item.id} onClick={() => gameEvents.emit('command', { type: 'assign-employee', employeeId: item.id, vehicleId: vehicle.id })}>Trocar por {item.name}</button>)}</div>}
    {shift && <FleetActiveShiftCard hud={hud} />}
  </article>;
}

function FleetEmployeeBrowser({ hud, navigation, navigate, confirm }: { hud: HudSnapshot; navigation: FleetNavigation; navigate: (patch: Partial<FleetNavigation>) => void; confirm: ConfirmFn }) {
  const employees = hud.fleet.employees;
  const selected = employees.find((employee) => employee.id === navigation.employeeId) ?? employees[0];
  const index = selected ? employees.findIndex((employee) => employee.id === selected.id) : -1;
  const cycle = (step: number) => employees.length && navigate({ employeeId: employees[(Math.max(index, 0) + step + employees.length) % employees.length].id });
  const candidates = EMPLOYEE_CANDIDATES.filter((candidate) => !employees.some((employee) => employee.id === candidate.id));

  return <section className="employee-browser" data-testid="fleet-employee-browser">
    {employees.length ? <>
      <div className="fleet-cycle-controls"><button onClick={() => cycle(-1)} disabled={employees.length < 2}>← Funcionário anterior</button><b>Funcionário {index + 1} de {employees.length}</b><button onClick={() => cycle(1)} disabled={employees.length < 2}>Próximo funcionário →</button></div>
      {selected && <FleetEmployeeDetail hud={hud} employee={selected} navigate={navigate} />}
    </> : <section className="fleet-card"><b>Nenhum funcionário contratado</b><p>Escolha um candidato abaixo para começar a formar sua equipe.</p></section>}
    <h3>Candidatos disponíveis</h3>
    <div className="candidate-list">{candidates.map((candidate) => <article key={candidate.id}><span className="candidate-avatar">{candidate.avatar}</span><div><b>{candidate.name}</b><small>{candidate.description}</small><em>{candidate.qualifications.map(qualificationLabel).join(' • ')}</em><em>Comissão {candidate.commissionPercent}% • contratação {formatCurrency(candidate.hireCost)}</em></div><button onClick={() => confirm(`contratar ${candidate.name} por ${formatCurrency(candidate.hireCost)}`, { type: 'hire-employee', candidateId: candidate.id, requestId: requestId(`hire-${candidate.id}`) })}>Contratar</button></article>)}</div>
  </section>;
}

function FleetEmployeeDetail({ hud, employee, navigate }: { hud: HudSnapshot; employee: FleetEmployee; navigate: (patch: Partial<FleetNavigation>) => void }) {
  const vehicle = hud.fleet.vehicles.find((item) => item.id === employee.vehicleId);
  const garage = hud.fleet.garages.find((item) => item.serviceId === employee.baseGarageId);
  const shift = hud.fleet.activeShift?.employeeId === employee.id ? hud.fleet.activeShift : null;
  const compatible = hud.fleet.vehicles.filter((item) => item.id !== hud.activeVehicleId && !hud.fleet.activeShift && canEmployeeDrive(employee, item));
  return <article className="employee-detail-card" data-testid="selected-fleet-employee" data-employee-id={employee.id}>
    {navigationReturnVehicle(navigate)}
    <header><span className="candidate-avatar large">{employee.avatar}</span><div><small>FUNCIONÁRIO</small><h3>{employeeIdentification(employee.name)}</h3><span>{employeeStateLabel(employee.state)} • comissão {employee.commissionPercent}%</span></div></header>
    <div className="employee-skill-grid"><span><small>Direção</small><b>{employee.driving}</b></span><span><small>Segurança</small><b>{employee.safety}</b></span><span><small>Atendimento</small><b>{employee.service}</b></span><span><small>Eficiência</small><b>{employee.efficiency}</b></span></div>
    <div className="qualification-chips">{employee.qualifications.map((qualification) => <span key={qualification}>{qualificationLabel(qualification)}</span>)}</div>
    {vehicle ? <section className="assigned-vehicle"><div><small>VEÍCULO ATRIBUÍDO</small><b>{vehicle.model}</b><span>{vehicleStateLabel(vehicle.state)} • {vehicle.condition.toFixed(0)}%</span></div><button onClick={() => navigate({ section: 'vehicles', vehicleId: vehicle.id, employeeId: employee.id })}>Ver veículo</button></section> : <section className="unassigned-driver"><b>Sem veículo atribuído</b>{compatible.map((item) => <button key={item.id} onClick={() => gameEvents.emit('command', { type: 'assign-employee', employeeId: employee.id, vehicleId: item.id })}>Atribuir {item.model}</button>)}</section>}
    {garage && <button className="direct-link" onClick={() => navigate({ section: 'garages', garageId: garage.serviceId, employeeId: employee.id })}>Ver garagem • {garage.name}</button>}
    <div className="assignment-actions"><button onClick={() => navigate({ section: 'training', employeeId: employee.id })}>Treinamentos</button>{vehicle && !shift && <button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'start-fleet-shift', employeeId: employee.id, requestId: requestId(`shift-${employee.id}`) })}>Iniciar turno</button>}{vehicle && !shift && <button onClick={() => gameEvents.emit('command', { type: 'unassign-employee', employeeId: employee.id })}>Remover veículo</button>}</div>
    {shift && <FleetActiveShiftCard hud={hud} />}
    <EmployeeRegionalSettings hud={hud} employee={employee} />
  </article>;
}

function navigationReturnVehicle(navigate: (patch: Partial<FleetNavigation>) => void) {
  return rememberedFleetNavigation.vehicleId ? <button className="back-link" onClick={() => navigate({ section: 'vehicles', vehicleId: rememberedFleetNavigation.vehicleId })}>← Voltar ao veículo</button> : null;
}

function EmployeeRegionalSettings({ hud, employee }: { hud: HudSnapshot; employee: FleetEmployee }) {
  const disabled = hud.fleet.activeShift?.employeeId === employee.id;
  const regions = hud.regionCatalog.filter((region) => region.playable && region.chunkIds.length > 0);
  return <details className="regional-preferences"><summary>Área de trabalho e preferências</summary>
    <label>Região preferida<select disabled={disabled} value={employee.regionalPreferences.preferredRegionId} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { preferredRegionId: event.target.value } })}><option value="any">Qualquer região</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
    <label>Distância máxima<select disabled={disabled} value={employee.regionalPreferences.maximumDistanceKm} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { maximumDistanceKm: Number(event.target.value) } })}>{[8,12,18,25].map((value) => <option key={value} value={value}>{value} km</option>)}</select></label>
    <label>Combustível mínimo<select disabled={disabled} value={employee.regionalPreferences.minimumFuelPercent} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { minimumFuelPercent: Number(event.target.value) } })}>{[15,20,30,40].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
    <label>Condição mínima<select disabled={disabled} value={employee.regionalPreferences.minimumCondition} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { minimumCondition: Number(event.target.value) } })}>{[35,45,55,70].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
    <label className="toggle-setting"><input disabled={disabled} type="checkbox" checked={employee.regionalPreferences.acceptLongTrips} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { acceptLongTrips: event.target.checked } })} /> Aceitar viagens longas</label>
    <label className="toggle-setting"><input disabled={disabled} type="checkbox" checked={employee.regionalPreferences.returnToGarage} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { returnToGarage: event.target.checked } })} /> Retornar à garagem</label>
  </details>;
}

function FleetGarageBrowser({ hud, navigation, navigate, confirm }: { hud: HudSnapshot; navigation: FleetNavigation; navigate: (patch: Partial<FleetNavigation>) => void; confirm: ConfirmFn }) {
  const garage = hud.fleet.garages.find((item) => item.serviceId === navigation.garageId) ?? hud.fleet.garages[0];
  const vehicles = hud.fleet.vehicles.filter((vehicle) => vehicle.baseGarageId === garage?.serviceId);
  const employees = hud.fleet.employees.filter((employee) => employee.baseGarageId === garage?.serviceId);
  const available = hud.serviceLocations.filter((service) => service.category === 'garage' && !hud.fleet.garages.some((item) => item.serviceId === service.id));
  return <section className="garage-browser" data-testid="fleet-garage-browser"><div className="garage-capacity-grid">{hud.fleet.garages.map((item) => <button key={item.serviceId} className={garage?.serviceId === item.serviceId ? 'active' : ''} onClick={() => navigate({ garageId: item.serviceId })}><b>{item.name}</b><small>{item.regionId}</small></button>)}</div>{garage && <article className="garage-detail-card"><h3>{garage.name}</h3><p>{garage.regionId} • custo operacional {formatCurrency(garage.operatingCost)}</p><div className="fleet-stat-grid"><button onClick={() => navigate({ section: 'vehicles', garageId: garage.serviceId })}><b>{vehicles.length}/{garage.vehicleCapacity}</b><span>Veículos</span></button><button onClick={() => navigate({ section: 'employees', garageId: garage.serviceId })}><b>{employees.length}/{garage.employeeCapacity}</b><span>Funcionários</span></button></div><h4>Veículos nesta base</h4>{vehicles.map((vehicle) => <button className="direct-link" key={vehicle.id} onClick={() => navigate({ section: 'vehicles', vehicleId: vehicle.id, garageId: garage.serviceId })}>{vehicle.model} • {vehicleStateLabel(vehicle.state)}</button>)}<h4>Funcionários nesta base</h4>{employees.map((employee) => <button className="direct-link" key={employee.id} onClick={() => navigate({ section: 'employees', employeeId: employee.id, garageId: garage.serviceId })}>{employee.name} • {employeeStateLabel(employee.state)}</button>)}</article>}<h3>Novas garagens</h3><div className="service-list">{available.map((service) => <article className="fleet-card" key={service.id}><b>{service.gameName}</b><small>{service.address}</small><button onClick={() => confirm(`comprar ${service.gameName} por ${formatCurrency(GAME_CONFIG.fleet.regionalGaragePrice)}`, { type: 'buy-regional-garage', serviceId: service.id, requestId: requestId(`garage-${service.id}`) })}>Comprar • {formatCurrency(GAME_CONFIG.fleet.regionalGaragePrice)}</button></article>)}</div></section>;
}

function FleetTransfers({ hud, confirm, navigate }: { hud: HudSnapshot; confirm: ConfirmFn; navigate: (patch: Partial<FleetNavigation>) => void }) {
  return <section className="fleet-transfers" data-testid="fleet-transfers"><p>Veículos em operação, reparo ou dirigidos pelo jogador permanecem travados até ficarem disponíveis.</p><h3>Veículos</h3>{hud.fleet.vehicles.map((vehicle) => { const locked = vehicle.id === hud.activeVehicleId || vehicle.controllerType === 'EMPLOYEE' || hud.fleet.activeShift?.vehicleId === vehicle.id || vehicle.state === 'maintenance'; return <article className="fleet-card" key={vehicle.id}><button className="direct-link" onClick={() => navigate({ section: 'vehicles', vehicleId: vehicle.id })}>{vehicle.model}</button><small>{locked ? 'Transferência bloqueada durante uso ou reparo' : 'Escolha a garagem de destino'}</small><div className="assignment-actions">{hud.fleet.garages.filter((garage) => garage.serviceId !== vehicle.baseGarageId).map((garage) => <button key={garage.serviceId} disabled={locked} onClick={() => confirm(`transferir ${vehicle.model} para ${garage.name}`, { type: 'transfer-fleet-entity', entityKind: 'vehicle', entityId: vehicle.id, targetGarageId: garage.serviceId, requestId: requestId(`transfer-${vehicle.id}`) })}>{garage.name}</button>)}</div></article>; })}<h3>Funcionários</h3>{hud.fleet.employees.map((employee) => <article className="fleet-card" key={employee.id}><button className="direct-link" onClick={() => navigate({ section: 'employees', employeeId: employee.id })}>{employee.name}</button><div className="assignment-actions">{hud.fleet.garages.filter((garage) => garage.serviceId !== employee.baseGarageId).map((garage) => <button key={garage.serviceId} disabled={hud.fleet.activeShift?.employeeId === employee.id} onClick={() => confirm(`transferir ${employee.name} para ${garage.name}`, { type: 'transfer-fleet-entity', entityKind: 'employee', entityId: employee.id, targetGarageId: garage.serviceId, requestId: requestId(`transfer-${employee.id}`) })}>{garage.name}</button>)}</div></article>)}</section>;
}

const TRAINING_QUALIFICATIONS: EmployeeQualification[] = ['TAXI', 'MOTORCYCLE', 'DELIVERY_VAN', 'LIGHT_FREIGHT', 'BUS'];

function FleetTraining({ hud, navigation, navigate, confirm }: { hud: HudSnapshot; navigation: FleetNavigation; navigate: (patch: Partial<FleetNavigation>) => void; confirm: ConfirmFn }) {
  const employee = hud.fleet.employees.find((item) => item.id === navigation.employeeId) ?? hud.fleet.employees[0];
  return <section className="fleet-training" data-testid="fleet-training"><div className="training-employee-selector"><label>Funcionário<select value={employee?.id ?? ''} onChange={(event) => navigate({ employeeId: event.target.value })}><option value="" disabled>Selecione</option>{hud.fleet.employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{employee && <button onClick={() => navigate({ section: 'employees', employeeId: employee.id })}>Ver funcionário</button>}</div>{employee ? <><h3>{employee.name} • qualificações</h3><div className="qualification-chips">{employee.qualifications.map((qualification) => <span key={qualification}>{qualificationLabel(qualification)}</span>)}</div><div className="training-grid">{TRAINING_QUALIFICATIONS.map((qualification) => { const cost = qualification === 'BUS' ? GAME_CONFIG.fleet.busQualificationCost : GAME_CONFIG.fleet.employeeTrainingCost; const reason = trainingDisabledReason(hud, employee, qualification, cost); return <button className="training-button" key={qualification} disabled={Boolean(reason)} title={reason ?? `Treinar por ${formatCurrency(cost)}`} onClick={() => confirm(`treinar ${employee.name} em ${qualificationLabel(qualification)} por ${formatCurrency(cost)}`, { type: 'train-employee', employeeId: employee.id, qualification, requestId: requestId(`train-${employee.id}-${qualification}`) })}><b>{qualificationLabel(qualification)}</b><span>{formatCurrency(cost)}</span><small>{reason ?? 'Disponível agora'}</small></button>; })}</div></> : <section className="fleet-card"><b>Contrate um funcionário antes de iniciar treinamentos.</b><button onClick={() => navigate({ section: 'employees' })}>Ver candidatos</button></section>}</section>;
}

function FleetActiveShiftCard({ hud }: { hud: HudSnapshot }) {
  const shift = hud.fleet.activeShift;
  if (!shift) return null;
  const employee = hud.fleet.employees.find((item) => item.id === shift.employeeId);
  const vehicle = hud.fleet.vehicles.find((item) => item.id === shift.vehicleId);
  const repair = shift.repair;
  const repairProgress = repair ? Math.min(100, repair.elapsedSeconds / Math.max(1, repair.durationSeconds) * 100) : 0;
  const remainingRepairSeconds = repair ? Math.max(0, Math.ceil(repair.durationSeconds - repair.elapsedSeconds)) : 0;
  return <section className="fleet-card shift-card" data-testid="active-fleet-shift"><div className="shift-driver-summary"><span className="candidate-avatar">{employee?.avatar ?? 'DR'}</span><div><small>MOTORISTA EM TURNO</small><b>{employee ? employeeIdentification(employee.name) : 'Funcionário atribuído'}</b><span>{vehicle?.model ?? 'Veículo da frota'} • {employeeStateLabel(shift.state)}</span></div><em>{shift.simulationLevel}</em></div>{repair && <div className={`shift-repair-progress ${repair.completedAt ? 'complete' : ''}`} data-testid="fleet-repair-progress"><div><b>{repair.completedAt ? 'Reparo concluído' : employeeStateLabel(shift.state)}</b><span>{repair.workshopName} • {formatCurrency(repair.cost)}</span></div><i><em style={{ width: `${repairProgress}%` }} /></i><small>{repair.completedAt ? `Condição restaurada para ${repair.targetCondition.toFixed(0)}%` : `${Math.round(repairProgress)}% • cerca de ${remainingRepairSeconds} s restantes`}</small></div>}<div className="spec-grid"><span><small>Corridas</small><b>{shift.rides}</b></span><span><small>Receita</small><b>{formatCurrency(shift.grossRevenue)}</b></span><span><small>Despesas</small><b>{formatCurrency(shift.fuelCost + shift.commission + shift.maintenanceCost + shift.fines)}</b></span><span><small>Lucro</small><b>{formatCurrency(shift.netProfit)}</b></span></div><div className="panel-actions"><button className="ghost-button" disabled={Boolean(repair && !repair.completedAt)} onClick={() => gameEvents.emit('command', { type: 'follow-fleet-vehicle' })}>{repair && !repair.completedAt ? 'Veículo em reparo' : hud.fleetVehicleVisible ? 'Acompanhar veículo' : 'Localizar veículo'}</button><button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'end-fleet-shift' })}>Encerrar turno</button></div></section>;
}

function trainingDisabledReason(hud: HudSnapshot, employee: FleetEmployee, qualification: EmployeeQualification, cost: number) {
  if (employee.qualifications.includes(qualification)) return 'Já adquirido';
  if (hud.fleet.activeShift?.employeeId === employee.id) return 'Funcionário em operação';
  if (qualification === 'BUS' && !employee.qualifications.includes('LIGHT_FREIGHT')) return 'Pré-requisito: Frete leve';
  if (hud.money < cost) return `Saldo insuficiente: faltam ${formatCurrency(cost - hud.money)}`;
  return null;
}

function canEmployeeDrive(employee: FleetEmployee, vehicle: FleetVehicle) {
  const required: EmployeeQualification = vehicleCategory(vehicle) === 'ônibus' ? 'BUS'
    : vehicleCategory(vehicle) === 'motos' ? 'MOTORCYCLE'
      : ['Hatch Entrega', 'Furgão Compacto', 'Picape Leve'].includes(vehicle.model) ? 'DELIVERY_VAN'
        : vehicleCategory(vehicle) === 'carga' ? 'LIGHT_FREIGHT'
          : vehicle.taxiLicensed ? 'TAXI' : 'CAR';
  return employee.qualifications.includes(required);
}

function vehicleCategory(vehicle: FleetVehicle) {
  if (['Micro-ônibus Urbano', 'Ônibus Urbano Convencional'].includes(vehicle.model)) return 'ônibus';
  if (['Moto Urbana 125', 'Moto Cargo 160', 'Scooter Express 150', 'Triciclo Cargo 200'].includes(vehicle.model)) return 'motos';
  if (vehicle.model === 'Hatch Entrega') return 'entregas';
  if (['Furgão Compacto', 'Van de Carga', 'Picape Leve', 'Furgão Médio', 'Utilitário Baú'].includes(vehicle.model)) return 'carga';
  return 'passageiros';
}

function qualificationLabel(qualification: EmployeeQualification) {
  return ({ CAR: 'Carros', TAXI: 'Táxi', MOTORCYCLE: 'Motos', DELIVERY_VAN: 'Entregas', LIGHT_FREIGHT: 'Frete leve', BUS: 'Ônibus' } as const)[qualification];
}

function vehicleStateLabel(state: FleetVehicle['state']) {
  return ({ available: 'Disponível', 'player-driving': 'Com o jogador', 'employee-driving': 'Em operação', 'on-trip': 'Em viagem', returning: 'Retornando', refueling: 'Abastecendo', maintenance: 'Em reparo', 'out-of-fuel': 'Sem combustível', damaged: 'Danificado', parked: 'Estacionado' } as const)[state];
}

function employeeStateLabel(state: FleetEmployee['state']) {
  return ({ available: 'Disponível', 'waiting-vehicle': 'Aguardando veículo', 'preparing-vehicle': 'Preparando veículo', 'going-to-repair': 'Indo para o reparo', repairing: 'Em reparo', 'starting-shift': 'Iniciando turno', 'seeking-trip': 'Buscando serviço', 'en-route': 'A caminho', 'with-passenger': 'Em atendimento', returning: 'Retornando', refueling: 'Abastecendo', break: 'Em pausa', blocked: 'Bloqueado', 'ending-shift': 'Encerrando turno', resting: 'Descansando' } as const)[state] ?? state;
}

function LegacyFleetPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const licensed = hud.professionalStatus === 'licensed-taxi';
  const active = hud.fleet.vehicles.find((vehicle) => vehicle.id === hud.activeVehicleId);
  const employee = hud.fleet.employees[0];
  const shift = hud.fleet.activeShift;
  const atGarage = hud.nearbyService?.category === 'garage';
  const requirements = [
    [`${GAME_CONFIG.progression.regularization.completedRides} corridas`, hud.completedRides >= GAME_CONFIG.progression.regularization.completedRides],
    [`Nível ${GAME_CONFIG.progression.regularization.driverLevel}`, hud.driverLevel >= GAME_CONFIG.progression.regularization.driverLevel],
    [`Avaliação ${GAME_CONFIG.progression.regularization.rating.toFixed(2)}`, hud.rating >= GAME_CONFIG.progression.regularization.rating],
    [`${GAME_CONFIG.progression.regularization.totalKm} km`, hud.totalKm >= GAME_CONFIG.progression.regularization.totalKm],
    [`Reserva de ${formatCurrency(GAME_CONFIG.progression.regularization.money)}`, hud.money >= GAME_CONFIG.progression.regularization.money]
  ] as const;
  const assignable = hud.fleet.vehicles.filter((vehicle) => vehicle.id !== hud.activeVehicleId && (!employee || vehicle.controllerId === employee.id || vehicle.controllerType !== 'EMPLOYEE'));
  const playableRegions = hud.regionCatalog.filter((region) => region.playable && region.chunkIds.length > 0);
  const availableCandidates = EMPLOYEE_CANDIDATES.filter((candidate) => !hud.fleet.employees.some((item) => item.id === candidate.id)).slice(0, 8);
  const primaryGarage = hud.fleet.garages[0];

  return <><div className="panel-kicker">MINHA FROTA</div><h2>{hud.fleet.name} • {hud.fleet.vehicles.length} veículos</h2>
    <div className="service-list">{hud.fleet.garages.map((garage) => { const vehicles = hud.fleet.vehicles.filter((vehicle) => vehicle.baseGarageId === garage.serviceId).length; const employees = hud.fleet.employees.filter((employee) => employee.baseGarageId === garage.serviceId).length; return <div className="fleet-card" key={garage.serviceId}><b>{garage.name}</b><small>{vehicles}/5 veículos • {employees}/5 funcionários</small><em>{garage.regionId} • custo operacional {formatCurrency(garage.operatingCost)}</em></div>; })}</div>
    <section className={`regularization ${hud.regularizationReady || licensed ? 'ready' : ''}`} data-testid="regularization-panel"><b>{licensed ? 'TAXISTA REGULARIZADO' : hud.regularizationReady ? 'PRONTO PARA REGULARIZAR' : 'REGULARIZAÇÃO EM PROGRESSO'}</b><small>Processo simplificado para fins de gameplay.</small>{!licensed && <div className="requirement-list">{requirements.map(([label, complete]) => <span className={complete ? 'done' : ''} key={label}>{complete ? '✓' : '○'} {label}</span>)}</div>}{!licensed && <button className="primary-button" disabled={!hud.regularizationReady} onClick={() => confirm(`regularização por ${formatCurrency(GAME_CONFIG.taxi.regularizationCost)}`, { type: 'regularize-taxi', requestId: requestId('regularize') })}>Regularizar • {formatCurrency(GAME_CONFIG.taxi.regularizationCost)}</button>}</section>

    {licensed && active && !active.taxiLicensed && <section className="fleet-card"><b>Converter {active.model}</b><p>Preserva combustível, condição, quilometragem, melhorias, posição e histórico.</p><button className="primary-button" onClick={() => confirm(`converter em Táxi Popular por ${formatCurrency(GAME_CONFIG.taxi.conversionCost)}`, { type: 'convert-taxi', requestId: requestId('taxi-convert') })}>Converter • {formatCurrency(GAME_CONFIG.taxi.conversionCost)}</button></section>}
    {licensed && active?.taxiLicensed && <div className="taxi-status-line">Táxi Popular • livre/ocupado pelo taxímetro • {hud.taxiPoints.length} pontos reais no mapa</div>}

    <h3>Motorista</h3>
    {!employee && licensed && <div className="candidate-list">{EMPLOYEE_CANDIDATES.map((candidate) => <article key={candidate.id}><span className="candidate-avatar">{candidate.avatar}</span><div><b>{candidate.name}</b><small>{candidate.description}</small><em>Direção {candidate.driving} • Segurança {candidate.safety} • Atendimento {candidate.service} • Eficiência {candidate.efficiency}</em><em>Comissão {candidate.commissionPercent}% • contratação {formatCurrency(candidate.hireCost)}</em></div><button onClick={() => confirm(`contratar ${candidate.name} por ${formatCurrency(candidate.hireCost)}`, { type: 'hire-employee', candidateId: candidate.id, requestId: requestId(`hire-${candidate.id}`) })}>Contratar</button></article>)}</div>}
    {!licensed && <p>Conclua a regularização para contratar seu primeiro motorista.</p>}
    {employee && <section className="fleet-card employee-card"><div className="candidate-avatar">{employee.avatar}</div><div><b>{employeeIdentification(employee.name)}</b><small>{employee.state} • comissão {employee.commissionPercent}%</small><em>{employee.tripsCompleted} corridas • {formatCurrency(employee.grossRevenue)} produzidos</em></div>{!shift && employee.vehicleId && <button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'unassign-employee', employeeId: employee.id })}>Remover veículo</button>}</section>}

    {employee && <section className="fleet-card regional-preferences"><h3>Área de trabalho</h3><label className="quality-select">Região preferida<select disabled={Boolean(shift)} value={employee.regionalPreferences.preferredRegionId} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { preferredRegionId: event.target.value } })}><option value="any">Qualquer região</option>{playableRegions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label><div className="region-permission-list">{playableRegions.map((region) => { const checked = employee.regionalPreferences.allowedRegionIds.includes(region.id); return <label className="toggle-setting" key={region.id}><input disabled={Boolean(shift)} type="checkbox" checked={checked} onChange={() => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { allowedRegionIds: checked ? employee.regionalPreferences.allowedRegionIds.filter((id) => id !== region.id) : [...employee.regionalPreferences.allowedRegionIds, region.id] } })} /> {region.name}</label>; })}</div><small>Nenhuma marcada permite a região preferida e suas vizinhas.</small><label className="quality-select">Distância máxima<select disabled={Boolean(shift)} value={employee.regionalPreferences.maximumDistanceKm} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { maximumDistanceKm: Number(event.target.value) } })}><option value="8">8 km</option><option value="12">12 km</option><option value="18">18 km</option><option value="25">25 km</option></select></label><label className="quality-select">Combustível mínimo<select disabled={Boolean(shift)} value={employee.regionalPreferences.minimumFuelPercent} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { minimumFuelPercent: Number(event.target.value) } })}><option value="15">15%</option><option value="20">20%</option><option value="30">30%</option><option value="40">40%</option></select></label><label className="quality-select">Condição mínima<select disabled={Boolean(shift)} value={employee.regionalPreferences.minimumCondition} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { minimumCondition: Number(event.target.value) } })}><option value="35">35%</option><option value="45">45%</option><option value="55">55%</option><option value="70">70%</option></select></label><label className="quality-select">Posto preferido<select disabled={Boolean(shift)} value={employee.regionalPreferences.preferredFuelServiceId ?? ''} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { preferredFuelServiceId: event.target.value || null } })}><option value="">Mais próximo acessível</option>{hud.serviceLocations.filter((service) => service.category === 'fuel').map((service) => <option key={service.id} value={service.id}>{service.gameName}</option>)}</select></label><label className="quality-select">Oficina preferida<select disabled={Boolean(shift)} value={employee.regionalPreferences.preferredWorkshopServiceId ?? ''} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { preferredWorkshopServiceId: event.target.value || null } })}><option value="">Mais próxima acessível</option>{hud.serviceLocations.filter((service) => service.category === 'workshop').map((service) => <option key={service.id} value={service.id}>{service.gameName}</option>)}</select></label><label className="toggle-setting"><input disabled={Boolean(shift)} type="checkbox" checked={employee.regionalPreferences.acceptLongTrips} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { acceptLongTrips: event.target.checked } })} /> Aceitar viagens longas</label><label className="toggle-setting"><input disabled={Boolean(shift)} type="checkbox" checked={employee.regionalPreferences.returnToPreferredRegion} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { returnToPreferredRegion: event.target.checked } })} /> Retornar à região</label><label className="toggle-setting"><input disabled={Boolean(shift)} type="checkbox" checked={employee.regionalPreferences.returnToGarage} onChange={(event) => gameEvents.emit('command', { type: 'set-employee-regional-preferences', employeeId: employee.id, preferences: { returnToGarage: event.target.checked } })} /> Retornar à garagem</label></section>}

    {employee && !employee.vehicleId && <div className="fleet-actions"><h3>Atribuir veículo</h3>{assignable.length ? assignable.map((vehicle) => <button key={vehicle.id} disabled={!vehicle.taxiLicensed} onClick={() => gameEvents.emit('command', { type: 'assign-employee', employeeId: employee.id, vehicleId: vehicle.id })}>{vehicle.model} • {vehicle.taxiLicensed ? 'atribuir' : 'requer conversão em táxi'}</button>) : <p>Adquira um segundo veículo: o veículo dirigido pelo jogador não pode ser atribuído ao mesmo tempo.</p>}</div>}

    {licensed && hud.fleet.vehicles.length < hud.fleet.capacity && <section className="fleet-card"><b>Classificados da frota • Sedan 2012</b><small>Usado, estável, confortável, consumo moderado e preparado como táxi.</small><em>Condição inicial {GAME_CONFIG.fleet.secondVehicleCondition}% • {formatCurrency(GAME_CONFIG.fleet.secondVehiclePrice)}</em><button className="primary-button" disabled={!atGarage} onClick={() => confirm(`comprar Sedan 2012 por ${formatCurrency(GAME_CONFIG.fleet.secondVehiclePrice)}`, { type: 'buy-fleet-vehicle', requestId: requestId('sedan') })}>{atGarage ? 'Comprar e registrar' : 'Vá à garagem para comprar'}</button></section>}

    {employee?.vehicleId && !shift && <button className="primary-button full-button" onClick={() => gameEvents.emit('command', { type: 'start-fleet-shift', employeeId: employee.id, requestId: requestId('shift') })}>Iniciar turno de 4 horas</button>}
    {shift && <section className="fleet-card shift-card" data-testid="active-fleet-shift"><b>TURNO ATIVO • {shift.simulationLevel}</b><div className="spec-grid"><span><small>Corridas</small><b>{shift.rides}</b></span><span><small>Receita</small><b>{formatCurrency(shift.grossRevenue)}</b></span><span><small>Despesas</small><b>{formatCurrency(shift.fuelCost + shift.commission + shift.maintenanceCost + shift.fines)}</b></span><span><small>Lucro</small><b>{formatCurrency(shift.netProfit)}</b></span></div><div className="panel-actions"><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'follow-fleet-vehicle' })}>{hud.fleetVehicleVisible ? 'Acompanhar veículo' : 'Localizar veículo'}</button><button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'end-fleet-shift' })}>Encerrar turno</button></div></section>}

    <BusinessFleetSection hud={hud} confirm={confirm} primaryGarageId={primaryGarage?.serviceId} />
    <EmployeeOperations hud={hud} />
    {licensed && availableCandidates.length > 0 && <div className="candidate-list">{availableCandidates.map((candidate) => <article key={candidate.id}><span className="candidate-avatar">{candidate.avatar}</span><div><b>{candidate.name}</b><small>{candidate.description}</small><em>{candidate.qualifications.join(' • ')}</em><em>Comissão {candidate.commissionPercent}% • contratação {formatCurrency(candidate.hireCost)}</em></div><button onClick={() => confirm(`contratar ${candidate.name} por ${formatCurrency(candidate.hireCost)}`, { type: 'hire-employee', candidateId: candidate.id, requestId: requestId(`hire-${candidate.id}`) })}>Contratar</button></article>)}</div>}
    {hud.fleet.lastReport && <FleetReport hud={hud} />}
    <p>O veículo do funcionário substitui uma vaga do trânsito ambiente quando entra na simulação detalhada. Total terrestre: {hud.totalTerrestrialEntities}/{hud.trafficHardCeiling}.</p>
  </>;
}

function FleetReport({ hud }: { hud: HudSnapshot }) {
  const report = hud.fleet.lastReport!;
  return <section className="fleet-report" data-testid="fleet-report"><div className="panel-kicker">RELATÓRIO DA FROTA</div><div className="spec-grid"><span><small>Tempo</small><b>{report.elapsedMinutes} min</b></span><span><small>Corridas</small><b>{report.rides}</b></span><span><small>Quilômetros</small><b>{report.kilometers.toFixed(1)} km</b></span><span><small>Receita</small><b>{formatCurrency(report.grossRevenue)}</b></span><span><small>Combustível</small><b>{formatCurrency(report.fuelCost)}</b></span><span><small>Comissão</small><b>{formatCurrency(report.commission)}</b></span><span><small>Manutenção</small><b>{formatCurrency(report.repairs)}</b></span><span><small>Multas</small><b>{formatCurrency(report.fines)}</b></span></div><h3>Lucro {formatCurrency(report.netProfit)}</h3>{report.unvalidatedClock && <p>Horário local não validado; os limites seguros foram aplicados.</p>}{report.occurrences.map((occurrence) => <small key={occurrence}>• {occurrence}</small>)}{!report.acknowledged && <button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'ack-fleet-report' })}>Marcar como visto</button>}</section>;
}

function ServicesPanel({ hud }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const [section, setSection] = useState<'overview' | 'regions' | 'services'>('overview');
  const [filter, setFilter] = useState<'all' | 'fuel' | 'workshop' | 'garage'>('all');
  const [search, setSearch] = useState('');
  const normalized = search.trim().toLocaleLowerCase('pt-BR');
  const locations = hud.serviceLocations.filter((service) =>
    (filter === 'all' || service.category === filter)
    && (!normalized || `${service.gameName} ${service.address}`.toLocaleLowerCase('pt-BR').includes(normalized))
  );
  const playableRegions = hud.regionCatalog.filter((region) => region.playable);
  return <><div className="panel-kicker">CIDADE</div><h2>{hud.currentRegion}</h2><p className="current-address">{hud.currentAddress}</p>
    <nav className="fleet-tabs city-tabs" aria-label="Áreas da cidade">{([['overview','Visão geral'],['regions','Regiões'],['services','Locais']] as const).map(([id,label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)} data-testid={`city-tab-${id}`}>{label}</button>)}</nav>
    {section === 'overview' && <div className="city-overview"><div className="fleet-stat-grid"><button onClick={() => setSection('regions')}><small>Regiões</small><b>{playableRegions.length}</b><span>jogáveis</span></button><button onClick={() => { setFilter('fuel'); setSection('services'); }}><small>Postos</small><b>{hud.serviceLocations.filter((item) => item.category === 'fuel').length}</b><span>locais</span></button><button onClick={() => { setFilter('workshop'); setSection('services'); }}><small>Oficinas</small><b>{hud.serviceLocations.filter((item) => item.category === 'workshop').length}</b><span>locais</span></button><button onClick={() => { setFilter('garage'); setSection('services'); }}><small>Garagens</small><b>{hud.serviceLocations.filter((item) => item.category === 'garage').length}</b><span>bases</span></button></div><section className="fleet-card"><b>MAPA PROGRESSIVO</b><small>{hud.loadedMapChunks} trechos carregados ao redor do veículo • região atual {hud.currentRegion}</small></section><div className="quick-service-buttons"><button onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'fuel' })}>Ir ao posto mais próximo</button><button onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'workshop' })}>Ir à oficina mais próxima</button><button onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'garage' })}>Ir à garagem mais próxima</button></div>{hud.selectedService && <section className="fleet-card selected-city-route"><small>ROTA ATIVA</small><b>{hud.selectedService.gameName}</b><span>{hud.selectedService.address}</span><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'clear-service-route' })}>Cancelar rota</button></section>}</div>}
    {section === 'regions' && <div className="city-region-list">{playableRegions.map((region) => { const familiarity = hud.regionalFamiliarity[region.id]; const level = familiarity && familiarity.completedRides >= 12 ? 'Favorita' : familiarity && familiarity.completedRides >= 4 ? 'Conhecida' : 'Nova'; return <button key={region.id} className={region.id === hud.currentRegionId ? 'active' : ''} onClick={() => gameEvents.emit('command', { type: 'set-preferred-region', regionId: region.id })}><i style={{ background: region.color }} /><span><b>{region.name}</b><small>{level} • demanda {region.demandLevel}</small></span><em>{hud.preferredRegionId === region.id ? 'PREFERIDA' : region.id === hud.currentRegionId ? 'ATUAL' : 'PRIORIZAR'}</em></button>; })}</div>}
    {section === 'services' && <><div className="fleet-filter-grid city-filter-grid"><label className="fleet-search"><span>Buscar local</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou endereço" /></label><label><span>Tipo</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Todos</option><option value="fuel">Postos</option><option value="workshop">Oficinas</option><option value="garage">Garagens</option></select></label></div><div className="service-list compact-service-list">{locations.map((service) => <button key={service.id} className={hud.selectedService?.id === service.id ? 'active' : ''} onClick={() => gameEvents.emit('command', { type: 'navigate-service', serviceId: service.id })}><b>{service.gameName}</b><small>{service.category === 'fuel' ? 'Posto' : service.category === 'workshop' ? 'Oficina' : 'Garagem'} • {service.address}</small></button>)}{!locations.length && <p>Nenhum local encontrado.</p>}</div></>}
  </>;
}

function ServiceOperationPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const nearby = hud.nearbyService;
  if (!nearby) return <><div className="panel-kicker">ATENDIMENTO</div><h2>Nenhum serviço aberto</h2><p>Estacione dentro de um posto, oficina ou garagem e use o botão de atendimento que aparece no mapa.</p></>;
  const label = nearby.category === 'fuel' ? 'POSTO DE COMBUSTÍVEL' : nearby.category === 'workshop' ? 'OFICINA' : 'GARAGEM REGIONAL';
  return <><div className="panel-kicker">{label}</div><h2>{nearby.gameName}</h2><section className="service-location-card"><small>{nearby.address}</small><b>Veículo parado • atendimento disponível</b></section>
    {nearby.category === 'fuel' && <div className="service-actions standalone-service-actions"><h3>Abastecer • R$ 5,79/L</h3>{[5,10].map((liters) => <button key={liters} onClick={() => confirm(`${liters} L por ${formatCurrency(fuelPurchaseCost(liters))}`, { type: 'buy-fuel', liters, requestId: requestId('fuel') })}>{liters} L • {formatCurrency(fuelPurchaseCost(liters))}</button>)}<button onClick={() => confirm('completar o tanque', { type: 'buy-fuel', liters: 'full', requestId: requestId('fuel-full') })}>Completar tanque</button></div>}
    {nearby.category === 'workshop' && <div className="service-actions standalone-service-actions"><h3>Serviços da oficina</h3>{(['diagnosis','quick','partial','full','preventive'] as WorkshopServiceId[]).map((service) => { const price = workshopPrice(service, hud.condition, hud.maintenanceWear); return <button key={service} onClick={() => confirm(`${workshopLabel(service)} por ${formatCurrency(price)}`, { type: 'workshop-service', service, requestId: requestId('repair') })}>{workshopLabel(service)} • {formatCurrency(price)}</button>; })}</div>}
    {nearby.category === 'garage' && <><div className="spec-grid"><span><small>Veículos</small><b>{hud.fleet.vehicles.filter((vehicle) => vehicle.baseGarageId === nearby.id).length}</b></span><span><small>Funcionários</small><b>{hud.fleet.employees.filter((employee) => employee.baseGarageId === nearby.id).length}</b></span></div>{!hud.fleet.garages.some((garage) => garage.serviceId === nearby.id) ? <div className="service-actions standalone-service-actions"><h3>Comprar base regional</h3><button onClick={() => confirm(`${nearby.gameName} por ${formatCurrency(GAME_CONFIG.fleet.regionalGaragePrice)}`, { type: 'buy-regional-garage', serviceId: nearby.id, requestId: requestId('garage') })}>Comprar • {formatCurrency(GAME_CONFIG.fleet.regionalGaragePrice)}</button></div> : <p>Esta base já pertence à sua frota. Use a aba Garagem para veículos e melhorias.</p>}</>}
    <p>Este atendimento é independente da aba Cidade. Toda compra exige confirmação.</p></>;
}

function CashPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  return <><div className="panel-kicker">CAIXA</div><h2>{formatCurrency(hud.money)}</h2><div className="cash-summary"><span>Entradas <b>{formatCurrency(hud.totalEarned)}</b></span><span>Saídas <b>{formatCurrency(hud.totalSpent)}</b></span><span>Dívidas <b>{formatCurrency(hud.debts)}</b></span></div>{hud.debts > 0 && <button className="primary-button" onClick={() => confirm(`pagar ${formatCurrency(Math.min(hud.money, hud.debts))} da dívida`, { type: 'pay-debt', value: Math.min(hud.money, hud.debts), requestId: requestId('debt') })}>Pagar dívida</button>}<div className="ledger-list">{hud.ledger.slice(0, 16).map((entry) => <span key={entry.id}><i>{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</i><b>{entry.origin}</b><em className={entry.amount >= 0 ? 'income' : ''}>{entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}</em></span>)}{!hud.ledger.length && <p>Nenhuma movimentação ainda.</p>}</div></>;
}

function SettingsPanel({ hud }: { hud: HudSnapshot }) {
  const setQuality = (quality: Quality) => gameEvents.emit('command', { type: 'set-quality', quality });
  const setZoom = (zoom: CameraZoom) => gameEvents.emit('command', { type: 'set-camera-zoom', zoom });
  const setDensity = (density: TrafficDensity) => gameEvents.emit('command', { type: 'set-traffic-density', density });
  const playableRegions = hud.regionCatalog.filter((region) => region.playable && region.chunkIds.length > 0);
  return <><div className="panel-kicker">CONFIGURAÇÕES</div><h2>Experiência de jogo</h2><label className="quality-select"><b>REGIÃO PREFERIDA</b><select value={hud.preferredRegionId} onChange={(event) => gameEvents.emit('command', { type: 'set-preferred-region', regionId: event.target.value })}><option value="any">Qualquer região</option>{playableRegions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select><small>Prioriza ofertas próximas sem bloquear outras regiões.</small></label><label className="quality-select">Qualidade gráfica<select value={hud.settings.quality} onChange={(event) => setQuality(event.target.value as Quality)}><option value="automatic">Automática</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label><label className="quality-select">Distância da câmera<select value={hud.settings.cameraZoom} onChange={(event) => setZoom(event.target.value as CameraZoom)}><option value="near">Próxima</option><option value="normal">Normal</option><option value="far">Distante</option></select></label><label className="quality-select">Densidade do trânsito<select value={hud.settings.trafficDensity} onChange={(event) => setDensity(event.target.value as TrafficDensity)}><option value="automatic">Automática • leve</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta • 72 NPCs</option></select></label><label className="toggle-setting"><input type="checkbox" checked={hud.settings.cameraShake} onChange={(event) => gameEvents.emit('command', { type: 'set-camera-shake', enabled: event.target.checked })} /> Vibração da câmera em impactos</label><label className="toggle-setting"><input type="checkbox" checked={hud.settings.audio} onChange={(event) => gameEvents.emit('command', { type: 'set-audio', enabled: event.target.checked })} /> Áudio do jogo</label><p>WASD controla livremente. O piloto segue rotas e serviços. Espaço: freio de mão • R: reposicionar.</p><button className="danger-button" onClick={() => { if (confirm('Apagar todo o progresso local?')) { deleteSave(); location.reload(); } }}>Apagar progresso</button></>;
}

function WorldEffectsSettings({ hud }: { hud: HudSnapshot }) {
  return <section className="world-effects-settings">
    <div className="panel-kicker">CICLO VISUAL</div>
    <h2>Iluminação do mundo</h2>
    <label className="toggle-setting"><input type="checkbox" checked={hud.settings.reducedWorldEffects} onChange={(event) => gameEvents.emit('command', { type: 'set-reduced-world-effects', enabled: event.target.checked })} /> Reduzir faróis, postes e luzes de prédios</label>
    <p>A leitura das ruas e rotas permanece clara durante a noite.</p>
  </section>;
}

function EmployeeOperations({ hud }: { hud: HudSnapshot }) {
  return <section className="employee-operations"><h3>Equipe • {hud.fleet.employees.length}/5 nesta base</h3>{hud.fleet.employees.map((employee) => {
    const compatible = hud.fleet.vehicles.filter((vehicle) => vehicle.id !== hud.activeVehicleId && vehicle.controllerType !== 'EMPLOYEE');
    return <article className="fleet-card" key={`operations-${employee.id}`}><b>Equipe • {employee.name}</b><small>{employee.qualifications.join(' • ')}</small><em>{employee.vehicleId ? `Veículo ${hud.fleet.vehicles.find((vehicle) => vehicle.id === employee.vehicleId)?.model}` : 'Aguardando veículo'}</em>{!employee.vehicleId && compatible.map((vehicle) => <button key={vehicle.id} onClick={() => gameEvents.emit('command', { type: 'assign-employee', employeeId: employee.id, vehicleId: vehicle.id })}>Atribuir {vehicle.model}</button>)}{employee.vehicleId && !hud.fleet.activeShift && <button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'start-fleet-shift', employeeId: employee.id, requestId: requestId(`shift-${employee.id}`) })}>Iniciar operação</button>}</article>;
  })}</section>;
}

function CommercialWorkActions({ hud }: { hud: HudSnapshot }) {
  const active = hud.fleet.vehicles.find((vehicle) => vehicle.id === hud.activeVehicleId);
  return <section className="fleet-card"><h3>Entregas e fretes</h3><small>Coleta entre 500 m e 2 km, sempre calculada pela rota viária.</small><div className="panel-actions"><button disabled={!hud.businesses.some((business) => business.kind === 'delivery')} onClick={() => gameEvents.emit('command', { type: 'generate-work', business: 'delivery' })}>Buscar entrega • {active?.model}</button><button disabled={!hud.businesses.some((business) => business.kind === 'light-freight')} onClick={() => gameEvents.emit('command', { type: 'generate-work', business: 'light-freight' })}>Buscar frete leve • {active?.model}</button></div></section>;
}

function BusinessFleetSection({ hud, confirm, primaryGarageId }: { hud: HudSnapshot; confirm: ConfirmFn; primaryGarageId?: string }) {
  const delivery = hud.businesses.some((business) => business.kind === 'delivery');
  const freight = hud.businesses.some((business) => business.kind === 'light-freight');
  const bus = hud.businesses.some((business) => business.kind === 'bus');
  return <section className="business-fleet-section"><h3>Empresas</h3><p>Veículos liberados por cada empresa ficam organizados por categoria na aba Garagem.</p><div className="service-list">
    <article className="fleet-card"><b>Central de Entregas</b><small>Documentos, comida, pequenos volumes e expresso.</small><em>{delivery ? 'ATIVA' : `5 corridas • ${formatCurrency(GAME_CONFIG.fleet.deliveryBusinessPrice)}`}</em>{!delivery && primaryGarageId && <button disabled={hud.completedRides < 5} onClick={() => confirm('abrir Central de Entregas', { type: 'purchase-business', kind: 'delivery', garageId: primaryGarageId, requestId: requestId('business-delivery') })}>Abrir empresa</button>}</article>
    <article className="fleet-card"><b>Frete Brasília</b><small>Fretes urbanos, grandes volumes, mudanças e abastecimento.</small><em>{freight ? 'ATIVA' : `Central + 10 corridas • ${formatCurrency(GAME_CONFIG.fleet.freightBusinessPrice)}`}</em>{!freight && primaryGarageId && <button disabled={!delivery || hud.completedRides < 10} onClick={() => confirm('abrir Frete Brasília', { type: 'purchase-business', kind: 'light-freight', garageId: primaryGarageId, requestId: requestId('business-freight') })}>Abrir empresa</button>}</article>
    <article className="fleet-card"><b>Rota Coletiva Brasília</b><small>Linhas reais, paradas, lotação, pontualidade e operação manual ou automática.</small><em>{bus ? 'ATIVA' : `Frete + 15 corridas • ${formatCurrency(GAME_CONFIG.fleet.busBusinessPrice)}`}</em>{!bus && primaryGarageId && <button disabled={!freight || hud.completedRides < 15} onClick={() => confirm('abrir Rota Coletiva Brasília', { type: 'purchase-business', kind: 'bus', garageId: primaryGarageId, requestId: requestId('business-bus') })}>Abrir empresa</button>}</article>
  </div>
  {bus && <div className="service-list"><h3>Linhas públicas disponíveis</h3>{BUS_LINES.map((line) => <article className="fleet-card" key={line.id}><b>{line.publicCode} • {line.name}</b><small>{line.distanceKm.toFixed(1)} km • {line.estimatedMinutes} min • tarifa {formatCurrency(line.fare)} • demanda {line.demand}</small><small>Custo esperado {formatCurrency(line.expectedOperatingCost)} • lucro moderado {formatCurrency(line.expectedProfit)} • Semob/DF + OSM/ODbL</small><button disabled={!['Micro-ônibus Urbano','Ônibus Urbano Convencional'].includes(hud.fleet.vehicles.find((vehicle) => vehicle.id === hud.activeVehicleId)?.model ?? '')} onClick={() => gameEvents.emit('command', { type: 'start-bus-line', lineId: line.id })}>Iniciar linha</button></article>)}</div>}
  </section>;
}

function accountErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'CLOUD_NOT_CONFIGURED') return 'A nuvem está temporariamente indisponível. Seu progresso continua salvo neste dispositivo.';
  if (/already registered|already been registered|user already exists/i.test(message)) return 'Este e-mail já possui conta. Volte à tela inicial e use Entrar.';
  if (/rate limit/i.test(message)) return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
  return message || 'Não foi possível concluir agora. Tente novamente.';
}

function AccountSettingsPanel({ hud }: { hud: HudSnapshot }) {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await getAccountStatus();
    setAccount(next);
    if (next.email) setEmail(next.email);
    return next;
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage(accountErrorMessage(error)));
  }, [hud.online.accountLinkState]);

  const linkEmail = async () => {
    if (!email.trim()) { setMessage('Informe o e-mail que deseja vincular.'); return; }
    setBusy(true);
    setMessage('Criando uma cópia segura do progresso…');
    try {
      const guest = await ensureGuestSession();
      if (guest.kind === 'local') throw new Error('CLOUD_NOT_CONFIGURED');
      await forceCloudSave(loadSave());
      await requestGuestAccountLink(email);
      gameEvents.emit('command', { type: 'set-account-link-state', state: 'pending-email' });
      await refresh();
      setMessage('Progresso salvo. Confirme o e-mail recebido e depois volte aqui para definir sua senha.');
    } catch (error) {
      setMessage(accountErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const checkConfirmation = async () => {
    setBusy(true);
    try {
      const next = await refresh();
      if (next.kind === 'needs-password') setMessage('E-mail confirmado. Agora defina sua senha.');
      else if (next.kind === 'permanent') {
        gameEvents.emit('command', { type: 'set-account-link-state', state: 'permanent' });
        setMessage('Conta protegida e pronta para uso em outros dispositivos.');
      } else setMessage('Ainda aguardando a confirmação. Abra o link enviado para seu e-mail.');
    } catch (error) {
      setMessage(accountErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const finishAccount = async () => {
    if (password.length < 8) { setMessage('Use uma senha com pelo menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setMessage('As senhas não coincidem.'); return; }
    setBusy(true);
    setMessage('Finalizando a proteção do progresso…');
    try {
      await forceCloudSave(loadSave());
      await finishPermanentAccount(password);
      gameEvents.emit('command', { type: 'set-account-link-state', state: 'permanent' });
      await refresh();
      setPassword('');
      setConfirmPassword('');
      setMessage('Conta criada. Todo o progresso foi mantido e está protegido.');
    } catch (error) {
      setMessage(accountErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const status = account?.kind ?? (hud.online.accountLinkState === 'anonymous' ? 'anonymous' : hud.online.accountLinkState === 'pending-email' ? 'pending-email' : null);
  return <section className="account-settings" data-testid="account-settings">
    <div className="panel-kicker">CONTA E PROGRESSO</div>
    <h2>{status === 'permanent' ? 'Progresso protegido' : status === 'needs-password' ? 'Defina sua senha' : status === 'pending-email' ? 'Confirme seu e-mail' : 'Proteja seu progresso'}</h2>
    {status === 'permanent' ? <div className="account-protected"><span>✓</span><div><b>Conta vinculada</b><small>{account?.email ?? 'E-mail confirmado'} • disponível em outros dispositivos</small></div></div>
      : status === 'needs-password' ? <div className="account-form"><p>O e-mail <b>{account?.email}</b> foi confirmado. Crie a senha para concluir sem alterar seu jogador.</p><label>Nova senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} /></label><label>Confirmar senha<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} /></label><button className="primary-button" onClick={finishAccount} disabled={busy}>Concluir vínculo</button></div>
        : status === 'pending-email' ? <div className="account-form"><p>O save já foi associado à mesma conta de convidado. Abra a confirmação enviada para <b>{account?.email ?? email}</b>.</p><button className="primary-button" onClick={checkConfirmation} disabled={busy}>Já confirmei o e-mail</button></div>
          : status === 'local' ? <p>A nuvem está indisponível agora. Seu progresso continua salvo neste dispositivo e esta opção aparecerá quando a conexão voltar.</p>
            : <div className="account-form"><p>Vincular um e-mail mantém dinheiro, veículos, frota, corridas e conquistas. Uma cópia na nuvem é feita antes da mudança.</p><label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="voce@email.com" /></label><button className="primary-button" onClick={linkEmail} disabled={busy}>Criar conta sem perder progresso</button></div>}
    {message && <small className="account-message" role="status">{message}</small>}
  </section>;
}

function OnlineSettingsPanel({ hud }: { hud: HudSnapshot }) {
  const toggle = (setting: 'showPlayerNames' | 'showFleetNames' | 'showPlayersOnMap' | 'remoteSounds' | 'publicPresence', enabled: boolean) =>
    gameEvents.emit('command', { type: 'set-online-visibility', setting, enabled });
  return <section className="online-settings">
    <div className="panel-kicker">CIDADE COMPARTILHADA</div>
    <h2>Modo de jogo</h2>
    <label className="quality-select">Conexão
      <select data-testid="online-mode-select" value={hud.online.mode} onChange={(event) => gameEvents.emit('command', { type: 'set-online-mode', mode: event.target.value as 'online' | 'solo' })}>
        <option value="online">Online</option><option value="solo">Solo</option>
      </select>
    </label>
    <label className="quality-select">Limite visual
      <select value={hud.settings.onlineVisualLimit} onChange={(event) => gameEvents.emit('command', { type: 'set-online-visual-limit', limit: Number(event.target.value) })}>
        <option value="8">8 veículos</option><option value="16">16 veículos</option><option value="24">24 veículos</option><option value="40">40 veículos</option>
      </select>
    </label>
    <label className="toggle-setting"><input type="checkbox" checked={hud.settings.showPlayerNames} onChange={(event) => toggle('showPlayerNames', event.target.checked)} /> Mostrar nomes</label>
    <label className="toggle-setting"><input type="checkbox" checked={hud.settings.showFleetNames} onChange={(event) => toggle('showFleetNames', event.target.checked)} /> Mostrar frotas</label>
    <label className="toggle-setting"><input type="checkbox" checked={hud.settings.showPlayersOnMap} onChange={(event) => toggle('showPlayersOnMap', event.target.checked)} /> Jogadores próximos no mapa</label>
    <label className="toggle-setting"><input type="checkbox" checked={hud.settings.remoteSounds} onChange={(event) => toggle('remoteSounds', event.target.checked)} /> Sons remotos limitados</label>
    <label className="toggle-setting"><input type="checkbox" checked={hud.settings.publicPresence} onChange={(event) => toggle('publicPresence', event.target.checked)} /> Presença pública</label>
    <p>{hud.online.warning ?? (hud.online.state === 'ONLINE' ? `${hud.online.nearbyPlayers} jogadores próximos • ${hud.online.pingMs ?? '—'} ms` : 'O jogo continua local quando o serviço online não responde.')}</p>
  </section>;
}

function ReceiptCard({ hud }: { hud: HudSnapshot }) {
  const receipt = hud.receipt!;
  const official = hud.taxiMeter.state === 'finished';
  return <section className="receipt-card" data-testid="receipt-card"><div className="receipt-success">✓</div><div><small>{official ? 'CORRIDA OFICIAL CONCLUÍDA' : 'CORRIDA CONCLUÍDA'}</small><h2>{formatCurrency(receipt.total)}</h2><p>+{receipt.xp} XP • ★ {receipt.rating.toFixed(1)}</p></div><dl><div><dt>{official ? 'Taxímetro' : 'Garantido'}</dt><dd>{formatCurrency(receipt.guaranteedTotal ?? receipt.total)}</dd></div><div><dt>Bônus de qualidade</dt><dd>{formatCurrency(receipt.qualityBonus ?? 0)}</dd></div><div><dt>Gorjeta</dt><dd>{formatCurrency(receipt.tip ?? 0)}</dd></div><div><dt>Distância</dt><dd>{receipt.distanceKm.toFixed(2)} km</dd></div></dl>{receipt.positives?.length ? <p className="receipt-positive">✓ {receipt.positives.join(' • ')}</p> : null}{receipt.penaltyReasons?.length ? <p className="receipt-penalty">Atenção: {receipt.penaltyReasons.join(' • ')}</p> : null}{hud.autopilotEnabled && hud.autopilotNextMissionSeconds > 0 && <p className="autopilot-wait">Próxima recomendação em {hud.autopilotNextMissionSeconds}s</p>}<button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'dismiss-receipt' })}>Próxima corrida</button></section>;
}

function DevPanel({ hud, close }: { hud: HudSnapshot; close: () => void }) {
  const actions = [
    ['money-add','+ R$ 1.000'],['money-remove','- R$ 100'],['fuel-zero','Combustível 0'],['refuel','Tanque cheio'],['damage','Dano +25'],['repair','Reparar'],['wear','Desgaste +25'],['upgrade-all','Melhorias nível 3'],
    ['teleport-pickup','Ir ao passageiro'],['teleport-destination','Ir ao destino'],['service-entry','Ir à entrada do serviço'],['complete','Concluir etapa'],['generate','Gerar corrida'],['taxi-offer','Gerar corrida de táxi'],['meter-start','Iniciar taxímetro'],['meter-finish','Finalizar taxímetro'],
    ['regional-ride','Gerar corrida regional'],['long-ride','Gerar corrida longa'],['prefer-lago-sul','Preferir Lago Sul'],['prefer-jardim-botanico','Preferir Jardim Botânico'],['teleport-lago-sul','Ir ao Lago Sul'],['teleport-jardim-botanico','Ir ao Jardim Botânico'],['familiarity-add','Aumentar familiaridade'],['familiarity-clear','Limpar familiaridade'],
    ['rating','Avaliação 5'],['xp','+ 500 XP'],['goals','Concluir metas'],['regularization','Cumprir requisitos'],['regularize-now','Regularizar'],['remove-regularization','Remover regularização'],['convert-taxi','Converter Hatch'],
    ['hire-bia','Contratar Bia'],['hire-leo','Contratar Léo'],['hire-nara','Contratar Nara'],['dismiss-employee','Demitir'],['buy-sedan','Comprar Sedan'],['assign-first','Atribuir motorista'],['start-shift','Iniciar turno'],['end-shift','Encerrar turno'],
    ['fleet-hour','Simular 1 hora'],['fleet-eight-hours','Simular 8 horas'],['follow-fleet','Acompanhar frota'],['force-fuel','Forçar abastecimento'],['force-maintenance','Forçar manutenção'],
    ['regional-employee','Motorista nesta região'],['economy-compare','Comparar economia'],['service-coverage','Mostrar cobertura'],
    ['traffic-ahead','NPC à frente'],['traffic-jam','Engarrafamento travado'],['traffic-collision','NPC sobre o carro'],['traffic-head-on','NPC de frente'],['collision-light','Colisão leve'],['collision-moderate','Colisão moderada'],['collision-severe','Colisão severa'],
    ['traffic','Alternar trânsito'],['signals','Alternar semáforos'],['signal-phase','Avançar fase dos sinais'],['graph','Grafo de rotas'],['regions','Mostrar geofences'],
    ['world-0000','Hora 00:00'],['world-0500','Hora 05:00'],['world-0659','Hora 06:59'],['world-0700','Hora 07:00'],['world-0859','Hora 08:59'],['world-0900','Hora 09:00'],['world-1659','Hora 16:59'],['world-1700','Hora 17:00'],['world-1859','Hora 18:59'],['world-1900','Hora 19:00'],['world-2200','Hora 22:00'],
    ['online-latency','Latência online'],['online-loss','Perda online'],['online-disconnect','Forçar reconexão'],['online-fake','Criar remoto fictício'],['online-clear','Limpar remotos'],['reset','Reiniciar save']
  ];
  return <aside className="dev-panel"><button onClick={close}>×</button><h3>Painel de desenvolvimento {GAME_CONFIG.version}</h3><p className="dev-metrics">{hud.fps} FPS • {hud.trafficVehicles}/{hud.trafficCapacity} NPCs • teto {hud.trafficHardCeiling}<br />Frota: {hud.fleet.vehicles.length} veículos • {hud.fleet.employees.length} motorista • vaga reservada {hud.trafficReservedSlots}<br />Online: {hud.online.state} • sessão {hud.online.publicSessionId ?? '—'} • chunk {hud.currentChunk}<br />Canais {hud.online.subscribedTopics.length} • TX {hud.online.sendRateHz} Hz • RX {hud.online.receiveRateHz} Hz • ping {hud.online.pingMs ?? '—'} ms<br />Buffer {hud.online.interpolationBuffer} • extrapolando {hud.online.extrapolating} • perdidos {hud.online.lostPackets} • fora de ordem {hud.online.outOfOrderPackets}<br />Remotos {hud.online.nearbyPlayers} • funcionários {hud.online.remoteEmployees} • NPCs substituídos {hud.online.npcReplacements}</p><div>{actions.map(([action,label]) => <button key={action} onClick={() => gameEvents.emit('command', { type: 'dev', action })}>{label}</button>)}</div></aside>;
}

type ConfirmFn = (label: string, command: GameCommand) => void;
function requestId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function categoryLabel(category: string | undefined) { return category === 'urgent' ? 'Urgente' : category === 'comfort' ? 'Conforto' : 'Popular'; }
function taxiRequestLabel(request: string | undefined) { return request === 'taxi-rank' ? 'Ponto de táxi' : request === 'street-hail' ? 'Chamando na rua' : request === 'dispatch' ? 'Central' : 'Contato'; }
function workshopLabel(service: WorkshopServiceId) { return ({ diagnosis: 'Diagnóstico', quick: 'Reparo rápido', partial: 'Reparo parcial', full: 'Reparo completo', preventive: 'Preventiva' } as const)[service]; }
function autopilotStatus(hud: HudSnapshot) { if (hud.autopilotState === 'braking') return hud.autoBrakeReason === 'red-signal' ? 'freando no sinal' : 'freando para o trânsito'; if (hud.autopilotState === 'arriving') return 'chegando ao destino'; if (hud.autopilotState === 'waiting') return 'aguardando corrida'; if (hud.autopilotState === 'recovering') return 'recuperando a rota'; return 'seguindo a rota'; }
