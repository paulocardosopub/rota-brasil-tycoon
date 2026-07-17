import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { gameEvents } from './game/events';
import { createNewSave, deleteSave, loadSave, replaceSave } from './services/storage/saveService';
import { findCloudSaveConflict, resolveCloudSaveConflict, syncCloudSave, type CloudSaveConflict } from './services/supabase/cloudSaveService';
import type { PlayerSave } from './types/game';
import { Hud } from './ui/hud/Hud';
import { StartScreen } from './ui/screens/StartScreen';
import { ensureGuestSession } from './services/supabase/authService';

let cloudSyncQueue: Promise<void> = Promise.resolve();

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<PlayerSave>(() => loadSave());
  const [cloudConflict, setCloudConflict] = useState<CloudSaveConflict | null>(null);

  useEffect(() => gameEvents.on('save', (next) => {
    cloudSyncQueue = cloudSyncQueue.then(async () => {
      const current = loadSave();
      const candidate = current.cloudLineageId === next.cloudLineageId && current.revision >= next.revision ? current : next;
      const synced = await syncCloudSave(candidate);
      const latest = loadSave();
      if (latest.cloudLineageId === synced.cloudLineageId && latest.revision >= synced.revision) {
        replaceSave({ ...latest, lastCloudRevision: Math.max(latest.lastCloudRevision, synced.lastCloudRevision) });
      }
    }).catch((error) => console.warn('Sincronização adiada:', error));
  }), []);

  const continueGame = async () => {
    const local = loadSave();
    const conflict = await findCloudSaveConflict(local).catch(() => null);
    if (conflict) { setCloudConflict(conflict); return; }
    const synced = await syncCloudSave(local).catch(() => local);
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
    await ensureGuestSession().catch((error) => console.warn('Visitante online adiado:', error));
    await continueGame();
  };

  const chooseConflict = async (choice: 'local' | 'cloud') => {
    if (!cloudConflict) return;
    const selected = await resolveCloudSaveConflict(cloudConflict, choice).catch(() => choice === 'cloud' ? cloudConflict.remote : cloudConflict.local);
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
  return <main className="game-shell"><GameCanvas save={save} /><Hud /></main>;
}
