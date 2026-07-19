import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { PlayerSave } from '../types/game';
import { MainScene } from './scenes/MainScene';

export function GameCanvas({ save }: { save: PlayerSave }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const initialSize = scaledGameSize(container);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      backgroundColor: '#8fb878',
      scene: [new MainScene(save)],
      // Em telas grandes a alta densidade do canvas já suaviza as bordas. Evitar
      // MSAA ali preserva nitidez e recupera GPU para mapa, trânsito e rotas.
      render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        autoRound: false,
        width: initialSize.width,
        height: initialSize.height
      },
      fps: { target: 60, smoothStep: false, forceSetTimeOut: false },
      callbacks: { postBoot: keepRunningInBackground },
      input: { activePointers: 4 }
    });
    const canvas = container.querySelector('canvas');
    canvas?.setAttribute('data-testid', 'game-canvas');
    const resizeObserver = new ResizeObserver(() => {
      const size = scaledGameSize(container);
      game.scale.setGameSize(size.width, size.height);
    });
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      game.destroy(true);
    };
  }, [save]);

  return <div className="game-canvas" ref={containerRef} aria-label="Mapa jogável de Brasília" />;
}

function scaledGameSize(container: HTMLDivElement) {
  // A folga de 6% em telas grandes recupera o orçamento de GPU sem repetir a
  // ampliação borrada de 20% que existia antes da 0.7.0. Mobile permanece nativo.
  const scale = container.clientWidth >= 900 ? 0.94 : 1;
  return {
    width: Math.max(1, Math.round(container.clientWidth * scale)),
    height: Math.max(1, Math.round(container.clientHeight * scale))
  };
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
