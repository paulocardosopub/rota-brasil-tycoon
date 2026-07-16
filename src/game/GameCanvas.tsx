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
      fps: { target: 60, smoothStep: true },
      input: { activePointers: 4 }
    });
    const canvas = containerRef.current.querySelector('canvas');
    canvas?.setAttribute('data-testid', 'game-canvas');
    return () => game.destroy(true);
  }, [save]);

  return <div className="game-canvas" ref={containerRef} aria-label="Mapa jogável de Brasília" />;
}
