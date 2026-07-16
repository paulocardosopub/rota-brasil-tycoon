import { useEffect, useState } from 'react';
import { GAME_CONFIG } from '../../config/gameConfig';
import { formatCurrency } from '../../game/economy/fare';
import { ECONOMY_CONFIG, UPGRADE_IDS } from '../../game/economy/EconomyConfig';
import { fuelPurchaseCost, upgradePrice, workshopPrice, type WorkshopServiceId } from '../../game/economy/ExpenseCalculator';
import { gameEvents, type GameCommand } from '../../game/events';
import { EMPLOYEE_CANDIDATES } from '../../game/fleet/FleetConfig';
import { employeeIdentification } from '../../game/fleet/FleetRoutePlan';
import { createNewSave, deleteSave } from '../../services/storage/saveService';
import type { CameraZoom, HudSnapshot, Quality, TrafficDensity } from '../../types/game';
import { MobileControls } from './MobileControls';

const emptyGoals = { firstRide: false, fiveRides: false, collisionFreeRide: false, firstTip: false, firstRefuel: false, firstWorkshop: false, firstUpgrade: false, rating45: false, tenKm: false, thousandReais: false };
const emptyUpgrades = { engine: 0, brakes: 0, tires: 0, suspension: 0, economy: 0, comfort: 0 };
const emptySave = createNewSave();
const initialHud: HudSnapshot = {
  ready: false,
  settings: { quality: 'automatic', cameraMode: 'follow', audio: true, masterVolume: 0.7, engineVolume: 0.55, effectsVolume: 0.75, cameraShake: true, cameraZoom: 'normal', trafficDensity: 'automatic' },
  money: 100, speedKmh: 0, fuel: 18, fuelCapacity: 40, condition: 70, objective: 'Carregando o mapa de Brasília…',
  distanceRemaining: 0, etaSeconds: 0, headingDelta: 0, vehicleHeading: 0, fps: 0, redLightWarning: false,
  trafficVehicles: 0, trafficBuses: 0, trafficStunned: 0, trafficGhosted: 0, autopilotDeadlockRecoveries: 0,
  collisionEvents: 0, collisionSeverity: null, collisionRelativeSpeedKmh: 0, autopilotEnabled: false,
  autopilotNextMissionSeconds: 0, autopilotRoadCorrections: 0, autopilotMinRoadClearance: 0, simulationSeconds: 0,
  autopilotCollisionRecovery: false, autoBrakeReason: 'clear', autopilotState: 'off', autopilotTargetSpeedKmh: 0,
  trafficStopReason: 'Livre', repositionProgress: 0, routeRecalculations: 0, mission: null, receipt: null,
  ledger: [], debts: 0, upgrades: emptyUpgrades, maintenanceWear: 0, collisionDamage: 30, totalKm: 0,
  totalEarned: 0, totalSpent: 0, tipsEarned: 0, driverLevel: 1, rating: 5, completedRides: 0, goals: emptyGoals, regularizationReady: false,
  nearbyService: null, selectedService: null, airTraffic: 0, trafficCapacity: 0,
  trafficHardCeiling: GAME_CONFIG.traffic.maximumTerrestrialEntities, trafficReservedSlots: 0, serviceLocations: [], taxiPoints: [],
  professionalStatus: emptySave.professionalStatus, taxiLicense: emptySave.taxiLicense, taxiMeter: emptySave.taxiMeter,
  officialTaxiRides: 0, activeVehicleId: emptySave.activeVehicleId, fleet: emptySave.fleet,
  fleetVehicleVisible: false, fleetRouteTarget: null, fleetRouteRemaining: 0, fleetCompletedStops: 0,
  fleetDriverIdentification: null, totalTerrestrialEntities: 1
};

type Panel = 'rides' | 'garage' | 'fleet' | 'city' | 'settings' | 'cash' | null;

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
      data-autopilot-enabled={hud.autopilotEnabled ? 'true' : 'false'} data-autopilot-next-mission-seconds={hud.autopilotNextMissionSeconds}
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
      data-fleet-route-remaining={hud.fleetRouteRemaining.toFixed(2)} data-fleet-completed-stops={hud.fleetCompletedStops}
    >
      <header className="top-hud">
        <div className="brand-chip"><span>RB</span><div><b>Brasília</b><small>Centro • Dia</small></div></div>
        <div className="status-cluster">
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

      <section className="objective-card" data-testid="objective-card"><div className="objective-icon" style={{ transform: `rotate(${hud.headingDelta}rad)` }}>↑</div><div><small>OBJETIVO ATUAL</small><strong>{hud.objective}</strong><span>{hud.distanceRemaining < 1_000 ? `${Math.round(hud.distanceRemaining)} m` : `${(hud.distanceRemaining / 1000).toFixed(1)} km`} • aprox. {eta}</span></div></section>
      <div className="speedometer" data-testid="speedometer"><strong>{Math.round(hud.speedKmh)}</strong><span>km/h</span><small>{hud.speedKmh < 1 ? 'P' : 'D'}</small></div>
      {activeVehicle?.taxiLicensed && <TaxiMeter hud={hud} />}
      {hud.mission?.phase === 'offered' && !panel && <RideOfferCard hud={hud} />}
      {fuelPercent <= 25 && <button className={`fuel-warning ${fuelPercent <= 5 ? 'critical' : ''}`} data-testid="fuel-route-alert" onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'fuel' })}>COMBUSTÍVEL {fuelPercent <= 5 ? 'CRÍTICO' : fuelPercent <= 10 ? 'BAIXO' : 'EM 25%'} • IR AO POSTO</button>}
      {hud.condition <= 50 && <button className="repair-warning" data-testid="repair-route-alert" onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'workshop' })}>REPARO NECESSÁRIO • IR À OFICINA</button>}
      {hud.fleet.lastReport && !hud.fleet.lastReport.acknowledged && !panel && <button className="fleet-report-alert" onClick={() => choosePanel('fleet')}>RELATÓRIO DA FROTA • {formatCurrency(hud.fleet.lastReport.netProfit)}</button>}
      {hud.nearbyService && !panel && <button className="service-nearby" onClick={() => choosePanel(hud.nearbyService?.category === 'garage' ? 'garage' : 'city')}>{hud.nearbyService.gameName} • serviço disponível</button>}
      {import.meta.env.DEV && <div className="fps">{hud.fps} FPS • {hud.trafficVehicles} NPCs</div>}
      <div className="map-attribution">© OpenStreetMap contributors • ODbL</div>
      {hud.redLightWarning && <div className="red-warning">SINAL VERMELHO • MULTA APLICADA</div>}
      {hud.collisionSeverity && hud.collisionSeverity !== 'contact' && <div className={`impact-warning ${hud.collisionSeverity}`}>IMPACTO {hud.collisionSeverity.toUpperCase()} • {Math.round(hud.collisionRelativeSpeedKmh)} KM/H RELATIVOS</div>}
      {hud.repositionProgress > 0 && <div className="reposition-progress"><span style={{ width: `${hud.repositionProgress * 100}%` }} />Segure R para reposicionar</div>}
      {!hud.ready && <div className="loading-pill"><i /> Preparando as ruas de Brasília…</div>}
      {toast && <div className={`toast ${toast.tone ?? 'info'}`}>{toast.message}</div>}
      {panel && <PanelContent panel={panel} hud={hud} close={() => setPanel(null)} />}

      <button className={`autopilot-toggle ${hud.autopilotEnabled ? 'active' : ''}`} onClick={() => gameEvents.emit('command', { type: 'autopilot' })}
        aria-pressed={hud.autopilotEnabled} data-testid="autopilot-button"><span>{hud.autopilotEnabled ? '●' : '◎'}</span><b>{hud.autopilotEnabled ? 'Piloto ligado' : 'Piloto automático'}</b>{hud.autopilotEnabled && <small>{autopilotStatus(hud)} • alvo {Math.round(hud.autopilotTargetSpeedKmh)} km/h</small>}</button>
      <nav className="bottom-nav" aria-label="Navegação principal">
        <button className={!panel ? 'active' : ''} onClick={() => setPanel(null)}><span>◉</span>Dirigir</button>
        <button className={panel === 'rides' ? 'active' : ''} onClick={() => choosePanel('rides')} data-testid="rides-button"><span>▣</span>Corridas</button>
        <button className={panel === 'garage' ? 'active' : ''} onClick={() => choosePanel('garage')}><span>⌂</span>Garagem</button>
        <button className={panel === 'fleet' ? 'active' : ''} onClick={() => choosePanel('fleet')} data-testid="fleet-button"><span>◆</span>Minha Frota</button>
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

function TaxiMeter({ hud }: { hud: HudSnapshot }) {
  const meter = hud.taxiMeter;
  const labels = { free: 'LIVRE', 'en-route': 'A CAMINHO', boarding: 'EMBARQUE', occupied: 'OCUPADO', waiting: 'AGUARDANDO', finished: 'FINALIZADO' } as const;
  return <section className={`taxi-meter ${meter.state}`} data-testid="taxi-meter"><small>TAXÍMETRO • VALORES DE GAMEPLAY</small><b>{labels[meter.state]}</b><strong>{formatCurrency(meter.currentFare)}</strong>{meter.tripId && <span>{(meter.distanceMeters / 1_000).toFixed(2)} km • {Math.floor(meter.elapsedSeconds / 60)}:{String(Math.floor(meter.elapsedSeconds % 60)).padStart(2, '0')}</span>}</section>;
}

function RideOfferCard({ hud }: { hud: HudSnapshot }) {
  const mission = hud.mission!;
  const quote = mission.quote;
  const official = mission.rideMode === 'official-taxi';
  return <section className="ride-offer" data-testid="ride-offer"><div><small>{official ? 'TÁXI OFICIAL' : categoryLabel(mission.category)} • {mission.region}</small><b>{mission.passengerName}</b><span>{mission.pickupLabel} → {mission.destinationLabel}</span><em>Busca {mission.pickupDistanceKm?.toFixed(1) ?? '—'} km • viagem {quote?.estimatedDistanceKm.toFixed(1)} km • {quote?.estimatedMinutes.toFixed(0)} min</em><em>{mission.requirements?.join(' • ')} • {official ? 'estimativa' : 'garantido'} {formatCurrency(quote?.guaranteedTotal ?? 0)}</em></div><button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'accept-ride' })}>Aceitar</button><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'reject-ride' })}>Recusar</button></section>;
}

function PanelContent({ panel, hud, close }: { panel: Exclude<Panel, null>; hud: HudSnapshot; close: () => void }) {
  const [confirmation, setConfirmation] = useState<{ label: string; command: GameCommand } | null>(null);
  const confirm = (label: string, command: GameCommand) => setConfirmation({ label, command });
  const execute = () => { if (confirmation) gameEvents.emit('command', confirmation.command); setConfirmation(null); };
  return <aside className="game-panel"><button className="panel-close" onClick={close} aria-label="Fechar">×</button>
    {panel === 'rides' && <RidesPanel hud={hud} />}
    {panel === 'garage' && <GaragePanel hud={hud} confirm={confirm} />}
    {panel === 'fleet' && <FleetPanel hud={hud} confirm={confirm} />}
    {panel === 'city' && <ServicesPanel hud={hud} confirm={confirm} />}
    {panel === 'cash' && <CashPanel hud={hud} confirm={confirm} />}
    {panel === 'settings' && <SettingsPanel hud={hud} />}
    {confirmation && <div className="confirm-strip"><b>Confirmar {confirmation.label}?</b><button className="primary-button" onClick={execute}>Confirmar</button><button className="ghost-button" onClick={() => setConfirmation(null)}>Voltar</button></div>}
  </aside>;
}

function RidesPanel({ hud }: { hud: HudSnapshot }) {
  const mission = hud.mission;
  const official = mission?.rideMode === 'official-taxi';
  return <><div className="panel-kicker">CORRIDAS</div><h2>{mission?.phase === 'offered' ? 'Nova oferta' : mission?.passengerName ?? 'Procurando passageiro'}</h2>
    {hud.professionalStatus === 'licensed-taxi' && <div className="taxi-status-line">Táxi regularizado • {hud.officialTaxiRides} corridas oficiais</div>}
    {mission && <><div className="offer-details"><span><small>Modalidade</small><b>{official ? 'Táxi oficial' : 'Informal'}</b></span><span><small>{official ? 'Estimativa' : 'Garantido'}</small><b>{formatCurrency(mission.quote?.guaranteedTotal ?? 0)}</b></span><span><small>Até a busca</small><b>{mission.pickupDistanceKm?.toFixed(1) ?? '—'} km</b></span><span><small>Viagem</small><b>{mission.quote?.estimatedDistanceKm.toFixed(1)} km</b></span><span><small>Prazo</small><b>{Math.round((mission.deadlineSeconds ?? 0) / 60)} min</b></span><span><small>Solicitação</small><b>{taxiRequestLabel(mission.taxiRequestType)}</b></span></div><div className="ride-route"><span>●</span><div><b>{mission.pickupLabel}</b><i /><b>{mission.destinationLabel}</b></div><span>◆</span></div>{mission.phase === 'offered' ? <div className="panel-actions"><button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'accept-ride' })}>Aceitar corrida</button><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'reject-ride' })}>Recusar</button></div> : <button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'cancel-ride' })}>Cancelar corrida</button>}</>}
  </>;
}

function GaragePanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const atGarage = hud.nearbyService?.category === 'garage';
  const active = hud.fleet.vehicles.find((vehicle) => vehicle.id === hud.activeVehicleId);
  return <><div className="panel-kicker">GARAGEM E MELHORIAS</div><h2>{active?.model ?? 'Hatch 1998'}</h2><div className="spec-grid"><span><small>Condição</small><b>{Math.round(hud.condition)}%</b></span><span><small>Desgaste</small><b>{hud.maintenanceWear.toFixed(1)}%</b></span><span><small>Dano de colisão</small><b>{hud.collisionDamage.toFixed(1)}%</b></span><span><small>Tanque</small><b>{hud.fuel.toFixed(1)}/{hud.fuelCapacity} L</b></span></div>
    {!atGarage && <p>Vá até a Garagem do Hatch para instalar melhorias, comprar ou alternar veículos.</p>}
    <h3>Veículos estacionados</h3><div className="fleet-vehicle-list">{hud.fleet.vehicles.map((vehicle) => <div key={vehicle.id}><span><b>{vehicle.model}{vehicle.taxiLicensed ? ' • Táxi' : ''}</b><small>{vehicle.state} • {vehicle.condition.toFixed(0)}% • {vehicle.fuel.toFixed(1)} L</small></span>{vehicle.id === hud.activeVehicleId ? <em>ATIVO</em> : <button disabled={!atGarage || vehicle.controllerType === 'EMPLOYEE'} onClick={() => gameEvents.emit('command', { type: 'select-vehicle', vehicleId: vehicle.id })}>Dirigir</button>}</div>)}</div>
    <div className="upgrade-list">{UPGRADE_IDS.map((id) => { const price = upgradePrice(id, hud.upgrades); const name = ECONOMY_CONFIG.upgrades[id].name; return <div key={id}><span><b>{name}</b><small>Nível {hud.upgrades[id]}/3</small></span><button disabled={!atGarage || price === null} onClick={() => price !== null && confirm(`${name} por ${formatCurrency(price)}`, { type: 'buy-upgrade', upgrade: id, requestId: requestId('upgrade') })}>{price === null ? 'Máximo' : formatCurrency(price)}</button></div>; })}</div>
  </>;
}

function FleetPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
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

  return <><div className="panel-kicker">MINHA FROTA</div><h2>{hud.fleet.name} • {hud.fleet.vehicles.length}/{hud.fleet.capacity}</h2>
    <section className={`regularization ${hud.regularizationReady || licensed ? 'ready' : ''}`} data-testid="regularization-panel"><b>{licensed ? 'TAXISTA REGULARIZADO' : hud.regularizationReady ? 'PRONTO PARA REGULARIZAR' : 'REGULARIZAÇÃO EM PROGRESSO'}</b><small>Processo simplificado para fins de gameplay.</small>{!licensed && <div className="requirement-list">{requirements.map(([label, complete]) => <span className={complete ? 'done' : ''} key={label}>{complete ? '✓' : '○'} {label}</span>)}</div>}{!licensed && <button className="primary-button" disabled={!hud.regularizationReady} onClick={() => confirm(`regularização por ${formatCurrency(GAME_CONFIG.taxi.regularizationCost)}`, { type: 'regularize-taxi', requestId: requestId('regularize') })}>Regularizar • {formatCurrency(GAME_CONFIG.taxi.regularizationCost)}</button>}</section>

    {licensed && active && !active.taxiLicensed && <section className="fleet-card"><b>Converter {active.model}</b><p>Preserva combustível, condição, quilometragem, melhorias, posição e histórico.</p><button className="primary-button" onClick={() => confirm(`converter em Táxi Popular por ${formatCurrency(GAME_CONFIG.taxi.conversionCost)}`, { type: 'convert-taxi', requestId: requestId('taxi-convert') })}>Converter • {formatCurrency(GAME_CONFIG.taxi.conversionCost)}</button></section>}
    {licensed && active?.taxiLicensed && <div className="taxi-status-line">Táxi Popular • livre/ocupado pelo taxímetro • {hud.taxiPoints.length} pontos reais no mapa</div>}

    <h3>Motorista</h3>
    {!employee && licensed && <div className="candidate-list">{EMPLOYEE_CANDIDATES.map((candidate) => <article key={candidate.id}><span className="candidate-avatar">{candidate.avatar}</span><div><b>{candidate.name}</b><small>{candidate.description}</small><em>Direção {candidate.driving} • Segurança {candidate.safety} • Atendimento {candidate.service} • Eficiência {candidate.efficiency}</em><em>Comissão {candidate.commissionPercent}% • contratação {formatCurrency(candidate.hireCost)}</em></div><button onClick={() => confirm(`contratar ${candidate.name} por ${formatCurrency(candidate.hireCost)}`, { type: 'hire-employee', candidateId: candidate.id, requestId: requestId(`hire-${candidate.id}`) })}>Contratar</button></article>)}</div>}
    {!licensed && <p>Conclua a regularização para contratar seu primeiro motorista.</p>}
    {employee && <section className="fleet-card employee-card"><div className="candidate-avatar">{employee.avatar}</div><div><b>{employeeIdentification(employee.name)}</b><small>{employee.state} • comissão {employee.commissionPercent}%</small><em>{employee.tripsCompleted} corridas • {formatCurrency(employee.grossRevenue)} produzidos</em></div>{!shift && employee.vehicleId && <button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'unassign-employee', employeeId: employee.id })}>Remover veículo</button>}</section>}

    {employee && !employee.vehicleId && <div className="fleet-actions"><h3>Atribuir veículo</h3>{assignable.length ? assignable.map((vehicle) => <button key={vehicle.id} disabled={!vehicle.taxiLicensed} onClick={() => gameEvents.emit('command', { type: 'assign-employee', employeeId: employee.id, vehicleId: vehicle.id })}>{vehicle.model} • {vehicle.taxiLicensed ? 'atribuir' : 'requer conversão em táxi'}</button>) : <p>Adquira um segundo veículo: o veículo dirigido pelo jogador não pode ser atribuído ao mesmo tempo.</p>}</div>}

    {licensed && hud.fleet.vehicles.length < hud.fleet.capacity && <section className="fleet-card"><b>Classificados da frota • Sedan 2012</b><small>Usado, estável, confortável, consumo moderado e preparado como táxi.</small><em>Condição inicial {GAME_CONFIG.fleet.secondVehicleCondition}% • {formatCurrency(GAME_CONFIG.fleet.secondVehiclePrice)}</em><button className="primary-button" disabled={!atGarage} onClick={() => confirm(`comprar Sedan 2012 por ${formatCurrency(GAME_CONFIG.fleet.secondVehiclePrice)}`, { type: 'buy-fleet-vehicle', requestId: requestId('sedan') })}>{atGarage ? 'Comprar e registrar' : 'Vá à garagem para comprar'}</button></section>}

    {employee?.vehicleId && !shift && <button className="primary-button full-button" onClick={() => gameEvents.emit('command', { type: 'start-fleet-shift', employeeId: employee.id, requestId: requestId('shift') })}>Iniciar turno de 4 horas</button>}
    {shift && <section className="fleet-card shift-card" data-testid="active-fleet-shift"><b>TURNO ATIVO • {shift.simulationLevel}</b><div className="spec-grid"><span><small>Corridas</small><b>{shift.rides}</b></span><span><small>Receita</small><b>{formatCurrency(shift.grossRevenue)}</b></span><span><small>Despesas</small><b>{formatCurrency(shift.fuelCost + shift.commission + shift.maintenanceCost + shift.fines)}</b></span><span><small>Lucro</small><b>{formatCurrency(shift.netProfit)}</b></span></div><div className="panel-actions"><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'follow-fleet-vehicle' })}>{hud.fleetVehicleVisible ? 'Acompanhar veículo' : 'Localizar veículo'}</button><button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'end-fleet-shift' })}>Encerrar turno</button></div></section>}

    {hud.fleet.lastReport && <FleetReport hud={hud} />}
    <p>O veículo do funcionário substitui uma vaga do trânsito ambiente quando entra na simulação detalhada. Total terrestre: {hud.totalTerrestrialEntities}/{hud.trafficHardCeiling}.</p>
  </>;
}

function FleetReport({ hud }: { hud: HudSnapshot }) {
  const report = hud.fleet.lastReport!;
  return <section className="fleet-report" data-testid="fleet-report"><div className="panel-kicker">RELATÓRIO DA FROTA</div><div className="spec-grid"><span><small>Tempo</small><b>{report.elapsedMinutes} min</b></span><span><small>Corridas</small><b>{report.rides}</b></span><span><small>Quilômetros</small><b>{report.kilometers.toFixed(1)} km</b></span><span><small>Receita</small><b>{formatCurrency(report.grossRevenue)}</b></span><span><small>Combustível</small><b>{formatCurrency(report.fuelCost)}</b></span><span><small>Comissão</small><b>{formatCurrency(report.commission)}</b></span><span><small>Manutenção</small><b>{formatCurrency(report.repairs)}</b></span><span><small>Multas</small><b>{formatCurrency(report.fines)}</b></span></div><h3>Lucro {formatCurrency(report.netProfit)}</h3>{report.unvalidatedClock && <p>Horário local não validado; os limites seguros foram aplicados.</p>}{report.occurrences.map((occurrence) => <small key={occurrence}>• {occurrence}</small>)}{!report.acknowledged && <button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'ack-fleet-report' })}>Marcar como visto</button>}</section>;
}

function ServicesPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const nearby = hud.nearbyService;
  return <><div className="panel-kicker">CIDADE E SERVIÇOS REAIS</div><h2>{nearby ? nearby.gameName : 'Escolha um destino'}</h2><div className="quick-service-buttons"><button onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'fuel' })}>Posto mais próximo + piloto</button><button onClick={() => gameEvents.emit('command', { type: 'navigate-nearest-service', category: 'workshop' })}>Oficina mais próxima + piloto</button></div><div className="service-list">{hud.serviceLocations.map((service) => <button key={service.id} className={hud.selectedService?.id === service.id ? 'active' : ''} onClick={() => gameEvents.emit('command', { type: 'navigate-service', serviceId: service.id })}><b>{service.gameName}</b><small>{service.category === 'fuel' ? 'Posto' : service.category === 'workshop' ? 'Oficina' : 'Garagem'} • {service.address}</small></button>)}</div>
    {nearby?.category === 'fuel' && <div className="service-actions"><h3>Abastecer • R$ 5,79/L</h3>{[5,10].map((liters) => <button key={liters} onClick={() => confirm(`${liters} L por ${formatCurrency(fuelPurchaseCost(liters))}`, { type: 'buy-fuel', liters, requestId: requestId('fuel') })}>{liters} L • {formatCurrency(fuelPurchaseCost(liters))}</button>)}<button onClick={() => confirm('completar o tanque', { type: 'buy-fuel', liters: 'full', requestId: requestId('fuel-full') })}>Completar tanque</button></div>}
    {nearby?.category === 'workshop' && <div className="service-actions"><h3>Serviços da oficina</h3>{(['diagnosis','quick','partial','full','preventive'] as WorkshopServiceId[]).map((service) => { const price = workshopPrice(service, hud.condition, hud.maintenanceWear); return <button key={service} onClick={() => confirm(`${workshopLabel(service)} por ${formatCurrency(price)}`, { type: 'workshop-service', service, requestId: requestId('repair') })}>{workshopLabel(service)} • {formatCurrency(price)}</button>; })}</div>}
    {hud.selectedService && <button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'clear-service-route' })}>Cancelar rota de serviço</button>}
    <p>O piloto leva até a entrada e para dentro do lote. Toda compra exige confirmação.</p></>;
}

function CashPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  return <><div className="panel-kicker">CAIXA</div><h2>{formatCurrency(hud.money)}</h2><div className="cash-summary"><span>Entradas <b>{formatCurrency(hud.totalEarned)}</b></span><span>Saídas <b>{formatCurrency(hud.totalSpent)}</b></span><span>Dívidas <b>{formatCurrency(hud.debts)}</b></span></div>{hud.debts > 0 && <button className="primary-button" onClick={() => confirm(`pagar ${formatCurrency(Math.min(hud.money, hud.debts))} da dívida`, { type: 'pay-debt', value: Math.min(hud.money, hud.debts), requestId: requestId('debt') })}>Pagar dívida</button>}<div className="ledger-list">{hud.ledger.slice(0, 16).map((entry) => <span key={entry.id}><i>{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</i><b>{entry.origin}</b><em className={entry.amount >= 0 ? 'income' : ''}>{entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}</em></span>)}{!hud.ledger.length && <p>Nenhuma movimentação ainda.</p>}</div></>;
}

function SettingsPanel({ hud }: { hud: HudSnapshot }) {
  const setQuality = (quality: Quality) => gameEvents.emit('command', { type: 'set-quality', quality });
  const setZoom = (zoom: CameraZoom) => gameEvents.emit('command', { type: 'set-camera-zoom', zoom });
  const setDensity = (density: TrafficDensity) => gameEvents.emit('command', { type: 'set-traffic-density', density });
  return <><div className="panel-kicker">CONFIGURAÇÕES</div><h2>Experiência de jogo</h2><label className="quality-select">Qualidade gráfica<select value={hud.settings.quality} onChange={(event) => setQuality(event.target.value as Quality)}><option value="automatic">Automática</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label><label className="quality-select">Distância da câmera<select value={hud.settings.cameraZoom} onChange={(event) => setZoom(event.target.value as CameraZoom)}><option value="near">Próxima</option><option value="normal">Normal</option><option value="far">Distante</option></select></label><label className="quality-select">Densidade do trânsito<select value={hud.settings.trafficDensity} onChange={(event) => setDensity(event.target.value as TrafficDensity)}><option value="automatic">Automática • leve</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta • 72 NPCs</option></select></label><label className="toggle-setting"><input type="checkbox" checked={hud.settings.cameraShake} onChange={(event) => gameEvents.emit('command', { type: 'set-camera-shake', enabled: event.target.checked })} /> Vibração da câmera em impactos</label><label className="toggle-setting"><input type="checkbox" checked={hud.settings.audio} onChange={(event) => gameEvents.emit('command', { type: 'set-audio', enabled: event.target.checked })} /> Áudio do jogo</label><p>WASD controla livremente. O piloto segue rotas e serviços. Espaço: freio de mão • R: reposicionar.</p><button className="danger-button" onClick={() => { if (confirm('Apagar todo o progresso local?')) { deleteSave(); location.reload(); } }}>Apagar progresso</button></>;
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
    ['rating','Avaliação 5'],['xp','+ 500 XP'],['goals','Concluir metas'],['regularization','Cumprir requisitos'],['regularize-now','Regularizar'],['remove-regularization','Remover regularização'],['convert-taxi','Converter Hatch'],
    ['hire-bia','Contratar Bia'],['hire-leo','Contratar Léo'],['hire-nara','Contratar Nara'],['dismiss-employee','Demitir'],['buy-sedan','Comprar Sedan'],['assign-first','Atribuir motorista'],['start-shift','Iniciar turno'],['end-shift','Encerrar turno'],
    ['fleet-hour','Simular 1 hora'],['fleet-eight-hours','Simular 8 horas'],['follow-fleet','Acompanhar frota'],['force-fuel','Forçar abastecimento'],['force-maintenance','Forçar manutenção'],
    ['traffic-ahead','NPC à frente'],['traffic-collision','NPC sobre o carro'],['traffic-head-on','NPC de frente'],['collision-light','Colisão leve'],['collision-moderate','Colisão moderada'],['collision-severe','Colisão severa'],
    ['traffic','Alternar trânsito'],['signals','Alternar semáforos'],['signal-phase','Avançar fase dos sinais'],['graph','Grafo de rotas'],['reset','Reiniciar save']
  ];
  return <aside className="dev-panel"><button onClick={close}>×</button><h3>Painel de desenvolvimento 0.6.1</h3><p className="dev-metrics">{hud.fps} FPS • {hud.trafficVehicles}/{hud.trafficCapacity} NPCs • teto {hud.trafficHardCeiling}<br />Frota: {hud.fleet.vehicles.length} veículos • {hud.fleet.employees.length} motorista • vaga reservada {hud.trafficReservedSlots}</p><div>{actions.map(([action,label]) => <button key={action} onClick={() => gameEvents.emit('command', { type: 'dev', action })}>{label}</button>)}</div></aside>;
}

type ConfirmFn = (label: string, command: GameCommand) => void;
function requestId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function categoryLabel(category: string | undefined) { return category === 'urgent' ? 'Urgente' : category === 'comfort' ? 'Conforto' : 'Popular'; }
function taxiRequestLabel(request: string | undefined) { return request === 'taxi-rank' ? 'Ponto de táxi' : request === 'street-hail' ? 'Chamando na rua' : request === 'dispatch' ? 'Central' : 'Contato'; }
function workshopLabel(service: WorkshopServiceId) { return ({ diagnosis: 'Diagnóstico', quick: 'Reparo rápido', partial: 'Reparo parcial', full: 'Reparo completo', preventive: 'Preventiva' } as const)[service]; }
function autopilotStatus(hud: HudSnapshot) { if (hud.autopilotState === 'braking') return hud.autoBrakeReason === 'red-signal' ? 'freando no sinal' : 'freando para o trânsito'; if (hud.autopilotState === 'arriving') return 'chegando ao destino'; if (hud.autopilotState === 'waiting') return 'aguardando corrida'; if (hud.autopilotState === 'recovering') return 'recuperando a rota'; return 'seguindo a rota'; }
