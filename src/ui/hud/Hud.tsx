import { useEffect, useState } from 'react';
import { formatCurrency } from '../../game/economy/fare';
import { ECONOMY_CONFIG, UPGRADE_IDS } from '../../game/economy/EconomyConfig';
import { fuelPurchaseCost, upgradePrice, workshopPrice, type WorkshopServiceId } from '../../game/economy/ExpenseCalculator';
import { gameEvents, type GameCommand } from '../../game/events';
import type { CameraZoom, HudSnapshot, Quality, TrafficDensity, VehicleUpgradeId } from '../../types/game';
import { MobileControls } from './MobileControls';
import { deleteSave } from '../../services/storage/saveService';

const emptyGoals = { firstRide: false, fiveRides: false, collisionFreeRide: false, firstTip: false, firstRefuel: false, firstWorkshop: false, firstUpgrade: false, rating45: false, tenKm: false, thousandReais: false };
const emptyUpgrades = { engine: 0, brakes: 0, tires: 0, suspension: 0, economy: 0, comfort: 0 };
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
  totalEarned: 0, totalSpent: 0, tipsEarned: 0, driverLevel: 1, goals: emptyGoals, regularizationReady: false,
  nearbyService: null, selectedService: null, airTraffic: 0, trafficCapacity: 0, serviceLocations: []
};

type Panel = 'rides' | 'garage' | 'driver' | 'city' | 'settings' | 'cash' | null;

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
        event.preventDefault(); setDevOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const togglePause = () => { gameEvents.emit('command', { type: 'pause' }); setPaused((value) => !value); };
  const choosePanel = (next: Panel) => setPanel((current) => current === next ? null : next);
  const eta = hud.etaSeconds < 60 ? `${Math.max(1, Math.round(hud.etaSeconds))} s` : `${Math.round(hud.etaSeconds / 60)} min`;
  const fuelPercent = hud.fuel / hud.fuelCapacity * 100;

  return (
    <div className="hud" data-game-ready={hud.ready ? 'true' : 'false'} data-vehicle-name={hud.ready ? 'Hatch 1998' : ''}
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
    >
      <header className="top-hud">
        <div className="brand-chip"><span>RB</span><div><b>Brasília</b><small>Centro • Dia</small></div></div>
        <div className="status-cluster">
          <button className="money" onClick={() => choosePanel('cash')}><small>CAIXA</small><strong>{formatCurrency(hud.money)}</strong>{hud.debts > 0 && <em>Dívida {formatCurrency(hud.debts)}</em>}</button>
          <div className="vehicle-vitals">
            <div title="Combustível"><span className="vital-icon">⛽</span><b>{hud.fuel.toFixed(1)} L</b><i><em className={fuelPercent <= 10 ? 'critical' : ''} style={{ width: `${fuelPercent}%` }} /></i></div>
            <div title="Condição"><span className="vital-icon">◆</span><b>{Math.round(hud.condition)}%</b><i><em className="condition" style={{ width: `${hud.condition}%` }} /></i></div>
          </div>
          <button className="icon-button" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>{paused ? '▶' : 'Ⅱ'}</button>
          <button className="icon-button" onClick={() => gameEvents.emit('command', { type: 'camera' })} aria-label="Alternar câmera">⌁</button>
          <button className="icon-button" onClick={() => choosePanel('settings')} aria-label="Configurações">⚙</button>
        </div>
      </header>

      <section className="objective-card" data-testid="objective-card"><div className="objective-icon" style={{ transform: `rotate(${hud.headingDelta}rad)` }}>↑</div><div><small>OBJETIVO ATUAL</small><strong>{hud.objective}</strong><span>{hud.distanceRemaining < 1_000 ? `${Math.round(hud.distanceRemaining)} m` : `${(hud.distanceRemaining / 1000).toFixed(1)} km`} • aprox. {eta}</span></div></section>
      <div className="speedometer" data-testid="speedometer"><strong>{Math.round(hud.speedKmh)}</strong><span>km/h</span><small>{hud.speedKmh < 1 ? 'P' : 'D'}</small></div>
      {hud.mission?.phase === 'offered' && !panel && <RideOfferCard hud={hud} />}
      {fuelPercent <= 25 && <div className={`fuel-warning ${fuelPercent <= 5 ? 'critical' : ''}`}>COMBUSTÍVEL {fuelPercent <= 5 ? 'CRÍTICO' : fuelPercent <= 10 ? 'BAIXO' : 'EM 25%'}</div>}
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
        <button className={panel === 'driver' ? 'active' : ''} onClick={() => choosePanel('driver')}><span>★</span>Motorista</button>
        <button className={panel === 'city' ? 'active' : ''} onClick={() => choosePanel('city')}><span>⌖</span>Serviços</button>
      </nav>
      {!hud.autopilotEnabled && <MobileControls />}
      {paused && <button className="pause-overlay" onClick={togglePause}><span>▶</span><b>Continuar viagem</b><small>O jogo está pausado</small></button>}
      {hud.receipt && <ReceiptCard hud={hud} />}
      {devOpen && <DevPanel hud={hud} close={() => setDevOpen(false)} />}
    </div>
  );
}

function RideOfferCard({ hud }: { hud: HudSnapshot }) {
  const mission = hud.mission!;
  const quote = mission.quote;
  return <section className="ride-offer" data-testid="ride-offer"><div><small>{categoryLabel(mission.category)} • {mission.region}</small><b>{mission.passengerName}</b><span>{mission.pickupLabel} → {mission.destinationLabel}</span><em>Busca {mission.pickupDistanceKm?.toFixed(1) ?? '—'} km • viagem {quote?.estimatedDistanceKm.toFixed(1)} km • {quote?.estimatedMinutes.toFixed(0)} min</em><em>{mission.requirements?.join(' • ')} • garantido {formatCurrency(quote?.guaranteedTotal ?? 0)}</em></div><button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'accept-ride' })}>Aceitar</button><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'reject-ride' })}>Recusar</button></section>;
}

function PanelContent({ panel, hud, close }: { panel: Exclude<Panel, null>; hud: HudSnapshot; close: () => void }) {
  const [confirmation, setConfirmation] = useState<{ label: string; command: GameCommand } | null>(null);
  const confirm = (label: string, command: GameCommand) => setConfirmation({ label, command });
  const execute = () => { if (confirmation) gameEvents.emit('command', confirmation.command); setConfirmation(null); };
  return <aside className="game-panel"><button className="panel-close" onClick={close} aria-label="Fechar">×</button>
    {panel === 'rides' && <RidesPanel hud={hud} />}
    {panel === 'garage' && <GaragePanel hud={hud} confirm={confirm} />}
    {panel === 'driver' && <DriverPanel hud={hud} />}
    {panel === 'city' && <ServicesPanel hud={hud} confirm={confirm} />}
    {panel === 'cash' && <CashPanel hud={hud} confirm={confirm} />}
    {panel === 'settings' && <SettingsPanel hud={hud} />}
    {confirmation && <div className="confirm-strip"><b>Confirmar {confirmation.label}?</b><button className="primary-button" onClick={execute}>Confirmar</button><button className="ghost-button" onClick={() => setConfirmation(null)}>Voltar</button></div>}
  </aside>;
}

function RidesPanel({ hud }: { hud: HudSnapshot }) {
  const mission = hud.mission;
  return <><div className="panel-kicker">CORRIDAS</div><h2>{mission?.phase === 'offered' ? 'Nova oferta' : mission?.passengerName ?? 'Procurando passageiro'}</h2>
    {mission && <><div className="offer-details"><span><small>Categoria</small><b>{categoryLabel(mission.category)}</b></span><span><small>Garantido</small><b>{formatCurrency(mission.quote?.guaranteedTotal ?? 0)}</b></span><span><small>Até a busca</small><b>{mission.pickupDistanceKm?.toFixed(1) ?? '—'} km</b></span><span><small>Viagem</small><b>{mission.quote?.estimatedDistanceKm.toFixed(1)} km</b></span><span><small>Prazo</small><b>{Math.round((mission.deadlineSeconds ?? 0) / 60)} min</b></span><span><small>Requisito</small><b>{mission.requirements?.join(', ') ?? 'Hatch disponível'}</b></span></div><div className="ride-route"><span>●</span><div><b>{mission.pickupLabel}</b><i /><b>{mission.destinationLabel}</b></div><span>◆</span></div>{mission.phase === 'offered' ? <div className="panel-actions"><button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'accept-ride' })}>Aceitar corrida</button><button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'reject-ride' })}>Recusar</button></div> : <button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'cancel-ride' })}>Cancelar corrida</button>}</>}
  </>;
}

function GaragePanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const atGarage = hud.nearbyService?.category === 'garage';
  return <><div className="panel-kicker">GARAGEM E MELHORIAS</div><h2>Hatch 1998</h2><div className="spec-grid"><span><small>Condição</small><b>{Math.round(hud.condition)}%</b></span><span><small>Desgaste</small><b>{hud.maintenanceWear.toFixed(1)}%</b></span><span><small>Dano de colisão</small><b>{hud.collisionDamage.toFixed(1)}%</b></span><span><small>Tanque</small><b>{hud.fuel.toFixed(1)}/40 L</b></span></div>
    {!atGarage && <p>Vá até a Garagem do Hatch para instalar melhorias.</p>}
    <div className="upgrade-list">{UPGRADE_IDS.map((id) => { const price = upgradePrice(id, hud.upgrades); const name = ECONOMY_CONFIG.upgrades[id].name; return <div key={id}><span><b>{name}</b><small>Nível {hud.upgrades[id]}/3</small></span><button disabled={!atGarage || price === null} onClick={() => price !== null && confirm(`${name} por ${formatCurrency(price)}`, { type: 'buy-upgrade', upgrade: id, requestId: requestId('upgrade') })}>{price === null ? 'Máximo' : formatCurrency(price)}</button></div>; })}</div>
  </>;
}

function DriverPanel({ hud }: { hud: HudSnapshot }) {
  const goals: [keyof typeof hud.goals, string][] = [['firstRide','Primeira corrida'],['fiveRides','Cinco corridas'],['collisionFreeRide','Viagem sem colisão'],['firstTip','Primeira gorjeta'],['firstRefuel','Primeiro abastecimento'],['firstWorkshop','Visitar oficina'],['firstUpgrade','Primeira melhoria'],['rating45','Avaliação 4,5'],['tenKm','Rodar 10 km'],['thousandReais','Faturar R$ 1.000']];
  return <><div className="panel-kicker">MOTORISTA CLANDESTINO</div><h2>Nível {hud.driverLevel} • ★ {hud.mission ? hud.mission.quality ? 'em atividade' : 'disponível' : 'disponível'}</h2><div className="spec-grid"><span><small>Quilometragem</small><b>{hud.totalKm.toFixed(1)} km</b></span><span><small>Gorjetas</small><b>{formatCurrency(hud.tipsEarned)}</b></span><span><small>Faturamento</small><b>{formatCurrency(hud.totalEarned)}</b></span><span><small>Tráfego vivo</small><b>{hud.trafficVehicles} NPCs</b></span></div><div className="goal-list">{goals.map(([id,label]) => <span className={hud.goals[id] ? 'done' : ''} key={id}>{hud.goals[id] ? '✓' : '○'} {label}</span>)}</div><div className={`regularization ${hud.regularizationReady ? 'ready' : ''}`}><b>{hud.regularizationReady ? 'PRONTO PARA REGULARIZAR' : 'REGULARIZAÇÃO EM PROGRESSO'}</b><small>A empresa de táxi só será liberada em versão futura.</small></div></>;
}

function ServicesPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  const nearby = hud.nearbyService;
  return <><div className="panel-kicker">SERVIÇOS REAIS DE BRASÍLIA</div><h2>{nearby ? nearby.gameName : 'Escolha um destino'}</h2><div className="service-list">{hud.serviceLocations.map((service) => <button key={service.id} className={hud.selectedService?.id === service.id ? 'active' : ''} onClick={() => gameEvents.emit('command', { type: 'navigate-service', serviceId: service.id })}><b>{service.gameName}</b><small>{service.category === 'fuel' ? 'Posto' : service.category === 'workshop' ? 'Oficina' : 'Garagem'} • {service.address}</small></button>)}</div>
    {nearby?.category === 'fuel' && <div className="service-actions"><h3>Abastecer • R$ 5,79/L</h3>{[5,10].map((liters) => <button key={liters} onClick={() => confirm(`${liters} L por ${formatCurrency(fuelPurchaseCost(liters))}`, { type: 'buy-fuel', liters, requestId: requestId('fuel') })}>{liters} L • {formatCurrency(fuelPurchaseCost(liters))}</button>)}<button onClick={() => confirm(`completar o tanque`, { type: 'buy-fuel', liters: 'full', requestId: requestId('fuel-full') })}>Completar tanque</button></div>}
    {nearby?.category === 'workshop' && <div className="service-actions"><h3>Serviços da oficina</h3>{(['diagnosis','quick','partial','full','preventive'] as WorkshopServiceId[]).map((service) => { const price = workshopPrice(service, hud.condition, hud.maintenanceWear); return <button key={service} onClick={() => confirm(`${workshopLabel(service)} por ${formatCurrency(price)}`, { type: 'workshop-service', service, requestId: requestId('repair') })}>{workshopLabel(service)} • {formatCurrency(price)}</button>; })}</div>}
    {hud.selectedService && <button className="ghost-button" onClick={() => gameEvents.emit('command', { type: 'clear-service-route' })}>Cancelar rota de serviço</button>}
    <p>O piloto leva até a entrada e para dentro do lote. Toda compra exige confirmação.</p></>;
}

function CashPanel({ hud, confirm }: { hud: HudSnapshot; confirm: ConfirmFn }) {
  return <><div className="panel-kicker">CAIXA</div><h2>{formatCurrency(hud.money)}</h2><div className="cash-summary"><span>Entradas <b>{formatCurrency(hud.totalEarned)}</b></span><span>Saídas <b>{formatCurrency(hud.totalSpent)}</b></span><span>Dívidas <b>{formatCurrency(hud.debts)}</b></span></div>{hud.debts > 0 && <button className="primary-button" onClick={() => confirm(`pagar ${formatCurrency(Math.min(hud.money, hud.debts))} da dívida`, { type: 'pay-debt', value: Math.min(hud.money, hud.debts), requestId: requestId('debt') })}>Pagar dívida</button>}<div className="ledger-list">{hud.ledger.slice(0, 12).map((entry) => <span key={entry.id}><i>{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</i><b>{entry.origin}</b><em className={entry.amount >= 0 ? 'income' : ''}>{entry.amount >= 0 ? '+' : ''}{formatCurrency(entry.amount)}</em></span>)}{!hud.ledger.length && <p>Nenhuma movimentação ainda.</p>}</div></>;
}

function SettingsPanel({ hud }: { hud: HudSnapshot }) {
  const setQuality = (quality: Quality) => gameEvents.emit('command', { type: 'set-quality', quality });
  const setZoom = (zoom: CameraZoom) => gameEvents.emit('command', { type: 'set-camera-zoom', zoom });
  const setDensity = (density: TrafficDensity) => gameEvents.emit('command', { type: 'set-traffic-density', density });
  return <><div className="panel-kicker">CONFIGURAÇÕES</div><h2>Experiência de jogo</h2><label className="quality-select">Qualidade gráfica<select value={hud.settings.quality} onChange={(event) => setQuality(event.target.value as Quality)}><option value="automatic">Automática</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label><label className="quality-select">Distância da câmera<select value={hud.settings.cameraZoom} onChange={(event) => setZoom(event.target.value as CameraZoom)}><option value="near">Próxima</option><option value="normal">Normal</option><option value="far">Distante</option></select></label><label className="quality-select">Densidade do trânsito<select value={hud.settings.trafficDensity} onChange={(event) => setDensity(event.target.value as TrafficDensity)}><option value="automatic">Automática (10×)</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Máxima (10×)</option></select></label><label className="toggle-setting"><input type="checkbox" checked={hud.settings.cameraShake} onChange={(event) => gameEvents.emit('command', { type: 'set-camera-shake', enabled: event.target.checked })} /> Vibração da câmera em impactos</label><label className="toggle-setting"><input type="checkbox" checked={hud.settings.audio} onChange={(event) => gameEvents.emit('command', { type: 'set-audio', enabled: event.target.checked })} /> Áudio do jogo</label><p>WASD controla livremente. O piloto segue rotas e serviços, mas nunca compra por você. Espaço: freio de mão • R: reposicionar.</p><button className="danger-button" onClick={() => { if (confirm('Apagar todo o progresso local?')) { deleteSave(); location.reload(); } }}>Apagar progresso</button></>;
}

function ReceiptCard({ hud }: { hud: HudSnapshot }) {
  const receipt = hud.receipt!;
  return <section className="receipt-card" data-testid="receipt-card"><div className="receipt-success">✓</div><div><small>CORRIDA CONCLUÍDA</small><h2>{formatCurrency(receipt.total)}</h2><p>+{receipt.xp} XP • ★ {receipt.rating.toFixed(1)}</p></div><dl><div><dt>Garantido</dt><dd>{formatCurrency(receipt.guaranteedTotal ?? receipt.total)}</dd></div><div><dt>Bônus de qualidade</dt><dd>{formatCurrency(receipt.qualityBonus ?? 0)}</dd></div><div><dt>Gorjeta</dt><dd>{formatCurrency(receipt.tip ?? 0)}</dd></div><div><dt>Distância</dt><dd>{receipt.distanceKm.toFixed(2)} km</dd></div></dl>{receipt.positives?.length ? <p className="receipt-positive">✓ {receipt.positives.join(' • ')}</p> : null}{receipt.penaltyReasons?.length ? <p className="receipt-penalty">Atenção: {receipt.penaltyReasons.join(' • ')}</p> : null}{hud.autopilotEnabled && hud.autopilotNextMissionSeconds > 0 && <p className="autopilot-wait">Próxima recomendação em {hud.autopilotNextMissionSeconds}s</p>}<button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'dismiss-receipt' })}>Próxima corrida</button></section>;
}

function DevPanel({ hud, close }: { hud: HudSnapshot; close: () => void }) {
  const actions = [['money-add','+ R$ 1.000'],['money-remove','- R$ 100'],['fuel-zero','Combustível 0'],['refuel','Tanque cheio'],['damage','Dano +25'],['repair','Reparar'],['wear','Desgaste +25'],['upgrade-all','Melhorias nível 3'],['teleport-pickup','Ir ao passageiro'],['teleport-destination','Ir ao destino'],['service-entry','Ir à entrada do serviço'],['complete','Concluir etapa'],['generate','Gerar corrida'],['offer-urgent','Oferta urgente'],['rating','Avaliação 5'],['xp','+ 500 XP'],['goals','Concluir metas'],['regularization','Pronto regularização'],['debt','Criar dívida'],['simulate-10','Simular 10'],['simulate-50','Simular 50'],['simulate-100','Simular 100'],['traffic','Alternar trânsito'],['signals','Alternar semáforos'],['signal-phase','Fase do sinal'],['traffic-ahead','NPC à frente'],['traffic-collision','NPC sobre o carro'],['collision-light','Colisão leve'],['collision-moderate','Colisão moderada'],['collision-severe','Colisão severa'],['traffic-head-on','NPC de frente'],['time','Velocidade do tempo'],['graph','Grafo de rotas'],['reset','Reiniciar save']];
  return <aside className="dev-panel"><button onClick={close}>×</button><h3>Painel de desenvolvimento 0.5.0</h3><p className="dev-metrics">{hud.fps} FPS • {hud.trafficVehicles}/{hud.trafficCapacity} NPCs • {hud.airTraffic} sombras aéreas<br />Piloto: {hud.autopilotState} • caixa: {hud.ledger.length} transações • nível {hud.driverLevel}</p><div>{actions.map(([action,label]) => <button key={action} onClick={() => gameEvents.emit('command', { type: 'dev', action })}>{label}</button>)}</div></aside>;
}

type ConfirmFn = (label: string, command: GameCommand) => void;
function requestId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function categoryLabel(category: HudSnapshot['mission'] extends infer _ ? string | undefined : never) { return category === 'urgent' ? 'Urgente' : category === 'comfort' ? 'Conforto' : 'Popular'; }
function workshopLabel(service: WorkshopServiceId) { return ({ diagnosis: 'Diagnóstico', quick: 'Reparo rápido', partial: 'Reparo parcial', full: 'Reparo completo', preventive: 'Preventiva' } as const)[service]; }
function autopilotStatus(hud: HudSnapshot) { if (hud.autopilotState === 'braking') return hud.autoBrakeReason === 'red-signal' ? 'freando no sinal' : 'freando para o trânsito'; if (hud.autopilotState === 'arriving') return 'chegando ao destino'; if (hud.autopilotState === 'waiting') return 'aguardando corrida'; if (hud.autopilotState === 'recovering') return 'recuperando a rota'; return 'seguindo a rota'; }
