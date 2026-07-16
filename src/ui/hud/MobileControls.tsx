import { useEffect, useRef } from 'react';
import { gameEvents } from '../../game/events';

export function MobileControls() {
  const state = useRef({ throttle: 0, steering: 0, handbrake: false });
  const send = () => gameEvents.emit('command', { type: 'mobile-input', ...state.current });
  const releaseAll = () => {
    state.current = { throttle: 0, steering: 0, handbrake: false };
    send();
  };
  useEffect(() => {
    const releaseWhenHidden = () => { if (document.hidden) releaseAll(); };
    window.addEventListener('blur', releaseAll);
    window.addEventListener('orientationchange', releaseAll);
    document.addEventListener('visibilitychange', releaseWhenHidden);
    return () => {
      releaseAll();
      window.removeEventListener('blur', releaseAll);
      window.removeEventListener('orientationchange', releaseAll);
      document.removeEventListener('visibilitychange', releaseWhenHidden);
    };
  }, []);
  const bind = (field: 'throttle' | 'steering', value: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      state.current[field] = value;
      send();
    },
    onPointerUp: () => { state.current[field] = 0; send(); },
    onPointerCancel: () => { state.current[field] = 0; send(); },
    onLostPointerCapture: () => { state.current[field] = 0; send(); },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault()
  });

  return (
    <div className="mobile-controls" aria-label="Controles de direção">
      <div className="steering-pad">
        <button aria-label="Virar à esquerda" {...bind('steering', -1)}>‹</button>
        <button aria-label="Virar à direita" {...bind('steering', 1)}>›</button>
      </div>
      <button
        className="handbrake-button"
        aria-label="Freio de mão"
        onPointerDown={() => { state.current.handbrake = true; send(); }}
        onPointerUp={() => { state.current.handbrake = false; send(); }}
        onPointerCancel={() => { state.current.handbrake = false; send(); }}
        onLostPointerCapture={() => { state.current.handbrake = false; send(); }}
      >P</button>
      <div className="pedals">
        <button className="brake" aria-label="Frear ou dar ré" {...bind('throttle', -1)}><span>FREIO</span></button>
        <button className="accelerator" aria-label="Acelerar" {...bind('throttle', 1)}><span>ACELERAR</span></button>
      </div>
    </div>
  );
}
