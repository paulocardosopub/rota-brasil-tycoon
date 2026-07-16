import { useEffect, useState } from 'react';
import { GameCanvas } from './game/GameCanvas';
import { gameEvents } from './game/events';
import { createNewSave, deleteSave, loadSave } from './services/storage/saveService';
import { syncCloudSave } from './services/supabase/cloudSaveService';
import type { PlayerSave } from './types/game';
import { Hud } from './ui/hud/Hud';
import { StartScreen } from './ui/screens/StartScreen';

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [save, setSave] = useState<PlayerSave>(() => loadSave());

  useEffect(() => gameEvents.on('save', (next) => {
    void syncCloudSave(next).catch((error) => console.warn('Sincronização adiada:', error));
  }), []);

  const continueGame = async () => {
    const local = loadSave();
    const synced = await syncCloudSave(local).catch(() => local);
    setSave(synced);
    setPlaying(true);
  };
  const newGame = () => {
    deleteSave();
    setSave(createNewSave());
    setPlaying(true);
  };

  if (!playing) return <StartScreen onContinue={continueGame} onNewGame={newGame} onGuest={continueGame} />;
  return <main className="game-shell"><GameCanvas save={save} /><Hud /></main>;
}
