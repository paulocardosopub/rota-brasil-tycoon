import { lazy, Suspense, useEffect, useState } from 'react';
import { gameEvents } from './game/events';
import { createNewSave, deleteSave, loadSave, replaceSave } from './services/storage/saveService';
import type { CloudSaveConflict } from './services/supabase/cloudSaveService';
import type { PlayerSave } from './types/game';
import { StartScreen } from './ui/screens/StartScreen';
import { CloudSyncAcknowledgement } from './services/supabase/CloudSyncAcknowledgement';

const GameCanvas = lazy(() => import('./game/GameCanvas').then((module) => ({ default: module.GameCanvas })));
const Hud = lazy(() => import('./ui/hud/Hud').then((module) => ({ default: module.Hud })));

let cloudSyncQueue: Promise<void> = Promise.resolve();
const cloudSyncAcknowledgement = new CloudSyncAcknowledgement();

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<PlayerSave>(() => loadSave());
  const [cloudConflict, setCloudConflict] = useState<CloudSaveConflict | null>(null);

  useEffect(() => gameEvents.on('save', (next) => {
    cloudSyncQueue = cloudSyncQueue.then(async () => {
      const { syncCloudSave } = await import('./services/supabase/cloudSaveService');
      const current = loadSave();
      const candidate = cloudSyncAcknowledgement.merge(
        current.cloudLineageId === next.cloudLineageId && current.revision >= next.revision ? current : next
      );
      const synced = await syncCloudSave(candidate);
      cloudSyncAcknowledgement.remember(synced);
      const latest = cloudSyncAcknowledgement.merge(loadSave());
      if (latest.cloudLineageId === synced.cloudLineageId && latest.revision >= synced.revision) {
        replaceSave({ ...latest, lastCloudRevision: Math.max(latest.lastCloudRevision, synced.lastCloudRevision) });
      }
    }).catch((error) => console.warn('Sincronização adiada:', error));
  }), []);

  const continueGame = async () => {
    const { findCloudSaveConflict, syncCloudSave } = await import('./services/supabase/cloudSaveService');
    const local = loadSave();
    const conflict = await findCloudSaveConflict(local).catch(() => null);
    if (conflict) { setCloudConflict(conflict); return; }
    const synced = await syncCloudSave(local).catch(() => local);
    cloudSyncAcknowledgement.remember(synced);
    replaceSave(synced);
    setSave(synced);
    setPlaying(true);
  };
  const newGame = () => {
    deleteSave();
    setSave(createNewSave());
    setPlaying(true);
  };
  const guestGame = async () => {
    const local = loadSave();
    if (local.lastCloudRevision === 0) {
      // A primeira partida local não possui um conflito remoto possível. A
      // identidade anônima pode ser preparada em segundo plano sem impedir o
      // jogador de dirigir; o fluxo normal de saves fará a sincronização.
      setSave(local);
      setPlaying(true);
      const { ensureGuestSession } = await import('./services/supabase/authService');
      void ensureGuestSession().catch((error) => console.warn('Visitante online adiado:', error));
      return;
    }
    const { ensureGuestSession } = await import('./services/supabase/authService');
    await ensureGuestSession().catch((error) => console.warn('Visitante online adiado:', error));
    await continueGame();
  };

  const chooseConflict = async (choice: 'local' | 'cloud') => {
    if (!cloudConflict) return;
    const { resolveCloudSaveConflict } = await import('./services/supabase/cloudSaveService');
    const selected = await resolveCloudSaveConflict(cloudConflict, choice).catch(() => choice === 'cloud' ? cloudConflict.remote : cloudConflict.local);
    cloudSyncAcknowledgement.remember(selected);
    setCloudConflict(null);
    setSave(selected);
    setPlaying(true);
  };

  if (cloudConflict) return <main className="start-screen"><section className="start-card cloud-conflict">
    <div className="eyebrow">CONFLITO DE SAVE</div><h1>Qual progresso usar?</h1>
    <p>Nenhum valor será somado ou sobrescrito sem sua escolha. Um backup local é mantido.</p>
    <div className="conflict-options">
      <button className="primary-button" onClick={() => chooseConflict('local')}>Este dispositivo • v{cloudConflict.local.saveVersion}<small>{new Date(cloudConflict.local.updatedAt).toLocaleString('pt-BR')}</small></button>
      <button onClick={() => chooseConflict('cloud')}>Nuvem • v{cloudConflict.remote.saveVersion}<small>{new Date(cloudConflict.remoteUpdatedAt).toLocaleString('pt-BR')}</small></button>
    </div>
  </section></main>;
  if (!playing) return <StartScreen onContinue={continueGame} onNewGame={newGame} onGuest={guestGame} />;
  return <Suspense fallback={<main className="start-screen"><section className="start-card"><div className="eyebrow">CARREGANDO REGIAO</div><h1>Preparando o trecho atual...</h1></section></main>}>
    <main className="game-shell"><GameCanvas save={save} /><Hud /></main>
  </Suspense>;
}
