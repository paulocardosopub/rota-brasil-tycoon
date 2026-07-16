import { useEffect, useState } from 'react';
import { formatCurrency } from '../../game/economy/fare';
import { gameEvents } from '../../game/events';
import type { HudSnapshot, Quality } from '../../types/game';
import { MobileControls } from './MobileControls';
import { deleteSave } from '../../services/storage/saveService';

const initialHud: HudSnapshot = {
  ready: false,
  money: 100,
  speedKmh: 0,
  fuel: 18,
  fuelCapacity: 40,
  condition: 70,
  objective: 'Carregando o mapa de Brasília…',
  distanceRemaining: 0,
  etaSeconds: 0,
  headingDelta: 0,
  fps: 0,
  redLightWarning: false,
  mission: null,
  receipt: null
};

type Panel = 'rides' | 'garage' | 'companies' | 'city' | 'settings' | null;

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

  const togglePause = () => {
    gameEvents.emit('command', { type: 'pause' });
    setPaused((value) => !value);
  };
  const choosePanel = (next: Panel) => setPanel((current) => current === next ? null : next);
  const eta = hud.etaSeconds < 60 ? `${Math.max(1, Math.round(hud.etaSeconds))} s` : `${Math.round(hud.etaSeconds / 60)} min`;

  return (
    <div className="hud" data-game-ready={hud.ready ? 'true' : 'false'} data-vehicle-name={hud.ready ? 'Hatch 1998' : ''}>
      <header className="top-hud">
        <div className="brand-chip"><span>RB</span><div><b>Brasília</b><small>Centro • Dia</small></div></div>
        <div className="status-cluster">
          <div className="money"><small>SALDO</small><strong>{formatCurrency(hud.money)}</strong></div>
          <div className="vehicle-vitals">
            <div title="Combustível"><span className="vital-icon">⛽</span><b>{hud.fuel.toFixed(1)} L</b><i><em style={{ width: `${hud.fuel / hud.fuelCapacity * 100}%` }} /></i></div>
            <div title="Condição"><span className="vital-icon">◆</span><b>{Math.round(hud.condition)}%</b><i><em className="condition" style={{ width: `${hud.condition}%` }} /></i></div>
          </div>
          <button className="icon-button" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>{paused ? '▶' : 'Ⅱ'}</button>
          <button className="icon-button" onClick={() => gameEvents.emit('command', { type: 'camera' })} aria-label="Alternar câmera">⌁</button>
          <button className="icon-button" onClick={() => choosePanel('settings')} aria-label="Configurações">⚙</button>
        </div>
      </header>

      <section className="objective-card" data-testid="objective-card">
        <div className="objective-icon" style={{ transform: `rotate(${hud.headingDelta}rad)` }}>↑</div>
        <div><small>OBJETIVO ATUAL</small><strong>{hud.objective}</strong><span>{hud.distanceRemaining < 1_000 ? `${Math.round(hud.distanceRemaining)} m` : `${(hud.distanceRemaining / 1000).toFixed(1)} km`} • aprox. {eta}</span></div>
      </section>

      <div className="speedometer" data-testid="speedometer">
        <strong>{Math.round(hud.speedKmh)}</strong><span>km/h</span><small>{hud.speedKmh < 1 ? 'P' : 'D'}</small>
      </div>

      {import.meta.env.DEV && <div className="fps">{hud.fps} FPS</div>}
      <div className="map-attribution">© OpenStreetMap contributors</div>
      {hud.redLightWarning && <div className="red-warning">SINAL VERMELHO • MULTA APLICADA</div>}
      {!hud.ready && <div className="loading-pill"><i /> Preparando as ruas de Brasília…</div>}
      {toast && <div className={`toast ${toast.tone ?? 'info'}`}>{toast.message}</div>}

      {panel && <PanelContent panel={panel} hud={hud} close={() => setPanel(null)} />}

      <nav className="bottom-nav" aria-label="Navegação principal">
        <button className={!panel ? 'active' : ''} onClick={() => setPanel(null)}><span>◉</span>Dirigir</button>
        <button className={panel === 'rides' ? 'active' : ''} onClick={() => choosePanel('rides')} data-testid="rides-button"><span>▣</span>Corridas</button>
        <button className={panel === 'garage' ? 'active' : ''} onClick={() => choosePanel('garage')}><span>⌂</span>Garagem</button>
        <button className={panel === 'companies' ? 'active' : ''} onClick={() => choosePanel('companies')}><span>▥</span>Empresas</button>
        <button className={panel === 'city' ? 'active' : ''} onClick={() => choosePanel('city')}><span>⌖</span>Cidade</button>
      </nav>

      <MobileControls />
      {paused && <button className="pause-overlay" onClick={togglePause}><span>▶</span><b>Continuar viagem</b><small>O jogo está pausado</small></button>}
      {hud.receipt && <ReceiptCard hud={hud} />}
      {devOpen && <DevPanel close={() => setDevOpen(false)} />}
    </div>
  );
}

function PanelContent({ panel, hud, close }: { panel: Exclude<Panel, null>; hud: HudSnapshot; close: () => void }) {
  const setQuality = (quality: Quality) => gameEvents.emit('command', { type: 'set-quality', quality });
  return (
    <aside className="game-panel">
      <button className="panel-close" onClick={close} aria-label="Fechar">×</button>
      {panel === 'rides' && <>
        <div className="panel-kicker">CORRIDA ATIVA</div><h2>{hud.mission?.passengerName ?? 'Procurando passageiro'}</h2>
        <div className="ride-route"><span>●</span><div><b>{hud.mission?.pickupLabel}</b><i /><b>{hud.mission?.destinationLabel}</b></div><span>◆</span></div>
        <p>Chegue a até 8 metros e pare abaixo de 5 km/h para embarcar ou desembarcar.</p>
        <button className="danger-button" onClick={() => gameEvents.emit('command', { type: 'cancel-ride' })}>Cancelar corrida</button>
      </>}
      {panel === 'garage' && <>
        <div className="panel-kicker">SUA GARAGEM</div><h2>Hatch 1998</h2>
        <div className="garage-car" aria-label="Hatch antigo laranja"><i /><b /><em /></div>
        <div className="spec-grid"><span><small>Condição</small><b>{Math.round(hud.condition)}%</b></span><span><small>Tanque</small><b>{hud.fuel.toFixed(1)}/40 L</b></span><span><small>Velocidade máx.</small><b>90 km/h</b></span><span><small>Categoria</small><b>Popular</b></span></div>
      </>}
      {panel === 'companies' && <>
        <div className="panel-kicker">PRÓXIMAS CONQUISTAS</div><h2>Construa seu império</h2>
        <div className="locked-list"><span>🔒 Cooperativa de táxi</span><span>🔒 Entregas e motoboys</span><span>🔒 Empresa de ônibus</span><span>🔒 Transportadora</span></div>
        <p>Regularize-se como taxista para iniciar a primeira empresa.</p>
      </>}
      {panel === 'city' && <>
        <div className="panel-kicker">EXPANSÃO NACIONAL</div><h2>Cidades</h2>
        <div className="city-list"><button className="unlocked"><b>Brasília</b><small>Jogando agora</small></button><button disabled><b>Goiânia</b><small>Bloqueada</small></button><button disabled><b>Rio de Janeiro</b><small>Bloqueada</small></button></div>
      </>}
      {panel === 'settings' && <>
        <div className="panel-kicker">CONFIGURAÇÕES</div><h2>Experiência de jogo</h2>
        <label className="quality-select">Qualidade gráfica<select defaultValue="automatic" onChange={(event) => setQuality(event.target.value as Quality)}><option value="automatic">Automática</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label>
        <p>Desktop: WASD ou setas • Espaço: freio de mão • R: reposicionar • Roda do mouse: zoom.</p>
        <button className="danger-button" onClick={() => { if (confirm('Apagar todo o progresso local?')) { deleteSave(); location.reload(); } }}>Apagar progresso</button>
      </>}
    </aside>
  );
}

function ReceiptCard({ hud }: { hud: HudSnapshot }) {
  const receipt = hud.receipt!;
  return (
    <section className="receipt-card" data-testid="receipt-card">
      <div className="receipt-success">✓</div><div><small>CORRIDA CONCLUÍDA</small><h2>{formatCurrency(receipt.total)}</h2><p>+{receipt.xp} XP • ★ {receipt.rating.toFixed(2)}</p></div>
      <dl><div><dt>Distância</dt><dd>{receipt.distanceKm.toFixed(2)} km</dd></div><div><dt>Tempo</dt><dd>{receipt.timeMinutes.toFixed(1)} min</dd></div><div><dt>Tarifa base</dt><dd>{formatCurrency(receipt.baseFare)}</dd></div><div><dt>Por distância</dt><dd>{formatCurrency(receipt.distanceFare)}</dd></div><div><dt>Por tempo</dt><dd>{formatCurrency(receipt.timeFare)}</dd></div><div><dt>Bônus de avaliação</dt><dd>{formatCurrency(receipt.ratingBonus)}</dd></div></dl>
      <button className="primary-button" onClick={() => gameEvents.emit('command', { type: 'dismiss-receipt' })}>Próxima corrida</button>
    </section>
  );
}

function DevPanel({ close }: { close: () => void }) {
  const actions = [
    ['money-add', '+ R$ 1.000'], ['money-remove', '- R$ 100'], ['refuel', 'Reabastecer'], ['repair', 'Reparar'],
    ['teleport-pickup', 'Ir ao passageiro'], ['teleport-destination', 'Ir ao destino'], ['complete', 'Concluir etapa'], ['generate', 'Gerar corrida'],
    ['traffic', 'Alternar trânsito'], ['signals', 'Alternar semáforos'], ['taxi', 'Liberar táxi'], ['time', 'Velocidade do tempo'],
    ['graph', 'Grafo de rotas'], ['colliders', 'Mostrar colisores'], ['reset', 'Reiniciar save']
  ];
  return <aside className="dev-panel"><button onClick={close}>×</button><h3>Painel de desenvolvimento</h3><div>{actions.map(([action, label]) => <button key={action} onClick={() => gameEvents.emit('command', { type: 'dev', action })}>{label}</button>)}</div></aside>;
}
