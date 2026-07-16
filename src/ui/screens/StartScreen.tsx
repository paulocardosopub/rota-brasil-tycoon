import { useState } from 'react';
import { hasSave } from '../../services/storage/saveService';
import { isCloudEnabled, supabase } from '../../services/supabase/client';

interface Props {
  onContinue: () => void;
  onNewGame: () => void;
  onGuest: () => void;
}

export function StartScreen({ onContinue, onNewGame, onGuest }: Props) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const signIn = async () => {
    if (!supabase) {
      setMessage('O modo nuvem não está configurado. Você ainda pode jogar como visitante.');
      return;
    }
    setMessage('Entrando…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else onContinue();
  };

  return (
    <main className="start-screen">
      <div className="start-city" aria-hidden="true">
        <div className="sky-glow" />
        <div className="city-block block-a" /><div className="city-block block-b" /><div className="city-block block-c" />
        <div className="start-road"><span /><span /><span /><span /></div>
        <div className="hero-car"><i /><b /><em /></div>
      </div>
      <section className="start-card">
        <div className="eyebrow">PLAYABLE 0.1.1 • BRASÍLIA</div>
        <h1><span>Rota Brasil</span> Tycoon</h1>
        <p>Comece ao volante de um Hatch 1998. Busque passageiros e construa sua futura empresa de transporte.</p>
        {!loginOpen ? (
          <div className="start-actions">
            <button className="primary-button" onClick={onGuest} data-testid="guest-button">Jogar como visitante <span>→</span></button>
            <div className="button-row">
              <button onClick={onContinue} disabled={!hasSave()}>Continuar</button>
              <button onClick={onNewGame}>Novo jogo</button>
              <button onClick={() => setLoginOpen(true)}>Entrar</button>
            </div>
          </div>
        ) : (
          <div className="login-panel">
            <button className="back-link" onClick={() => setLoginOpen(false)}>← Voltar</button>
            <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
            <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            <button className="primary-button" onClick={signIn}>Entrar na nuvem</button>
            <small>{message || (isCloudEnabled ? 'Seu progresso local será sincronizado após entrar.' : 'Supabase opcional não configurado.')}</small>
          </div>
        )}
        <footer><span className="status-dot" /> Jogue offline • Progresso salvo neste dispositivo</footer>
      </section>
    </main>
  );
}
