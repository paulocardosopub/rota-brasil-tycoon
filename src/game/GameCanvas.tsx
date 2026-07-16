import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { PlayerSave } from '../types/game';
import { MainScene } from './scenes/MainScene';

export function GameCanvas({ save }: { save: PlayerSave }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#8fb878',
      scene: [new MainScene(save)],
      render: { antialias: true, pixelArt: false, roundPixels: false },
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      fps: { target: 60, smoothStep: false, forceSetTimeOut: true },
      callbacks: { postBoot: keepRunningInBackground },
      input: { activePointers: 4 }
    });
    const canvas = containerRef.current.querySelector('canvas');
    canvas?.setAttribute('data-testid', 'game-canvas');
    return () => game.destroy(true);
  }, [save]);

  return <div className="game-canvas" ref={containerRef} aria-label="Mapa jogável de Brasília" />;
}

type BackgroundGame = Phaser.Game & {
  onHidden: () => void;
  onVisible: () => void;
  onBlur: () => void;
  onFocus: () => void;
};

function keepRunningInBackground(game: Phaser.Game) {
  queueMicrotask(() => {
    const backgroundGame = game as BackgroundGame;
    game.events.off(Phaser.Core.Events.HIDDEN, backgroundGame.onHidden, game);
    game.events.off(Phaser.Core.Events.VISIBLE, backgroundGame.onVisible, game);
    game.events.off(Phaser.Core.Events.BLUR, backgroundGame.onBlur, game);
    game.events.off(Phaser.Core.Events.FOCUS, backgroundGame.onFocus, game);
  });
}
