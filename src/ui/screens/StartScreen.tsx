import { useEffect, useState } from 'react';
import { GAME_CONFIG } from '../../config/gameConfig';
import { forceCloudSave } from '../../services/supabase/cloudSaveService';
import { getAccountStatus, finishPermanentAccount, onPasswordRecovery, registerPermanentAccount, requestPasswordRecovery, signInPermanent, updateRecoveredPassword, type AccountStatus } from '../../services/supabase/authService';
import { isCloudEnabled, supabase } from '../../services/supabase/client';
import { hasSave, loadSave, writeSave } from '../../services/storage/saveService';

interface Props {
  onContinue: () => void;
  onNewGame: () => void;
  onGuest: () => void;
}

type AuthMode = 'signin' | 'signup' | null;

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'CLOUD_NOT_CONFIGURED') return 'O modo nuvem não está configurado. Você ainda pode jogar como visitante.';
  if (message === 'ACCOUNT_ALREADY_SIGNED_IN') return 'Já existe uma conta conectada neste dispositivo.';
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/already registered|already been registered|user already exists/i.test(message)) return 'Este e-mail já possui conta. Use a opção Entrar.';
  if (/rate limit/i.test(message)) return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
  return message || 'Não foi possível concluir. Tente novamente.';
}

function saveAccountState(state: 'pending-email' | 'permanent') {
  const save = loadSave();
  save.accountLinkState = state;
  writeSave(save);
}

export function StartScreen({ onContinue, onNewGame, onGuest }: Props) {
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  const refreshAccount = async () => {
    const status = await getAccountStatus();
    setAccount(status);
    if (status.email) setEmail(status.email);
    if (status.kind === 'needs-password') setAuthMode('signup');
    return status;
  };

  useEffect(() => {
    void refreshAccount().catch(() => undefined);
    return onPasswordRecovery(() => {
      setAuthMode('signin');
      setRecoveringPassword(true);
      setMessage('Link confirmado. Crie uma nova senha para recuperar a conta.');
    });
  }, []);

  const openAuth = (mode: Exclude<AuthMode, null>) => {
    setAuthMode(mode);
    setMessage('');
    setPassword('');
    setConfirmPassword('');
    setRecoveringPassword(false);
    void refreshAccount().catch(() => undefined);
  };

  const recoverPassword = async () => {
    if (!email.trim()) { setMessage('Informe o e-mail da conta.'); return; }
    setBusy(true);
    try {
      await requestPasswordRecovery(email);
      setMessage('Enviamos um link seguro para redefinir sua senha. Seu save não será alterado.');
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const finishPasswordRecovery = async () => {
    if (password.length < 8) { setMessage('Use uma senha com pelo menos 8 caracteres.'); return; }
    if (password !== confirmPassword) { setMessage('As senhas não coincidem.'); return; }
    setBusy(true);
    try {
      await updateRecoveredPassword(password);
      setRecoveringPassword(false);
      setMessage('Senha atualizada. Carregando seu progresso protegido…');
      await onContinue();
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (!supabase) { setMessage(authErrorMessage(new Error('CLOUD_NOT_CONFIGURED'))); return; }
    if (!email.trim() || !password) { setMessage('Informe seu e-mail e sua senha.'); return; }
    setBusy(true);
    setMessage('Entrando…');
    try {
      await signInPermanent(email, password);
      setMessage('Conta conectada. Carregando seu progresso…');
      await onContinue();
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const createOrProtectAccount = async () => {
    if (!supabase) { setMessage(authErrorMessage(new Error('CLOUD_NOT_CONFIGURED'))); return; }
    if (account?.kind === 'pending-email') {
      setMessage(`Abra a mensagem enviada para ${account.email ?? email} e confirme o e-mail. Depois volte ao jogo para definir sua senha.`);
      return;
    }
    if (account?.kind === 'permanent') { onContinue(); return; }
    if (account?.kind === 'needs-password') {
      if (password.length < 8) { setMessage('Use uma senha com pelo menos 8 caracteres.'); return; }
      if (password !== confirmPassword) { setMessage('As senhas não coincidem.'); return; }
      setBusy(true);
      setMessage('Protegendo sua conta e seu progresso…');
      try {
        await forceCloudSave(loadSave());
        await finishPermanentAccount(password);
        saveAccountState('permanent');
        setAccount(await getAccountStatus());
        setMessage('Conta protegida. O progresso foi mantido e já pode ser acessado em outro dispositivo.');
      } catch (error) {
        setMessage(authErrorMessage(error));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim()) { setMessage('Informe o e-mail que ficará vinculado ao seu progresso.'); return; }
    const linkingGuest = account?.kind === 'anonymous';
    if (!linkingGuest) {
      if (password.length < 8) { setMessage('Use uma senha com pelo menos 8 caracteres.'); return; }
      if (password !== confirmPassword) { setMessage('As senhas não coincidem.'); return; }
    }

    setBusy(true);
    setMessage(linkingGuest ? 'Salvando o progresso antes de vincular…' : 'Criando sua conta…');
    try {
      if (linkingGuest) await forceCloudSave(loadSave());
      const result = await registerPermanentAccount(email, password);
      if (result.status === 'verification-sent') {
        if (linkingGuest) saveAccountState('pending-email');
        if (!linkingGuest) setConfirmationEmail(email.trim().toLowerCase());
        setAccount(await getAccountStatus());
        setMessage(linkingGuest
          ? 'Progresso salvo. Confirme o e-mail recebido e volte ao jogo para definir sua senha.'
          : 'Conta criada. Confirme o e-mail recebido para liberar o acesso.');
      } else {
        saveAccountState('permanent');
        setAccount(await getAccountStatus());
        setMessage('Conta criada e progresso protegido.');
      }
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const verifyConfirmation = async () => {
    setBusy(true);
    try {
      const status = await refreshAccount();
      if (status.kind === 'needs-password') setMessage('E-mail confirmado. Agora defina sua senha para concluir.');
      else if (status.kind === 'permanent') {
        setConfirmationEmail(null);
        saveAccountState('permanent');
        setMessage('E-mail confirmado. Carregando seu progresso…');
        await onContinue();
      } else setMessage('A confirmação ainda não chegou. Abra o link do e-mail e tente novamente.');
    } catch (error) {
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const isGuestLink = account?.kind === 'anonymous';
  const needsPassword = account?.kind === 'needs-password';
  const pendingEmail = account?.kind === 'pending-email';
  const awaitingConfirmation = pendingEmail || confirmationEmail !== null;

  return (
    <main className="start-screen">
      <div className="start-city" aria-hidden="true">
        <div className="sky-glow" />
        <div className="city-block block-a" /><div className="city-block block-b" /><div className="city-block block-c" />
        <div className="start-road"><span /><span /><span /><span /></div>
        <div className="hero-car"><i /><b /><em /></div>
      </div>
      <section className="start-card">
        <div className="eyebrow">PLAYABLE {GAME_CONFIG.version} — EXPANSÃO REGIONAL, ECONOMIA E SERVIÇOS</div>
        <h1><span>Rota Brasil</span> Tycoon</h1>
        <p>Comece ao volante de um Hatch 1998. Busque passageiros e construa sua futura empresa de transporte.</p>
        {!authMode ? (
          <div className="start-actions">
            <button className="primary-button" onClick={onGuest} data-testid="guest-button">Jogar como visitante <span>→</span></button>
            <button className="create-account-button" onClick={() => openAuth('signup')} data-testid="create-account-button">Criar conta grátis <span>Proteja seu progresso</span></button>
            <div className="button-row">
              <button onClick={onContinue} disabled={!hasSave()}>Continuar</button>
              <button onClick={onNewGame}>Novo jogo</button>
              <button onClick={() => openAuth('signin')}>Entrar</button>
            </div>
          </div>
        ) : (
          <div className="login-panel" data-testid={`auth-${authMode}`}>
            <button className="back-link" onClick={() => setAuthMode(null)}>← Voltar</button>
            <div className="auth-heading">
              <div className="panel-kicker">{authMode === 'signin' ? 'CONTA EXISTENTE' : isGuestLink || pendingEmail || needsPassword ? 'PROTEGER PROGRESSO' : 'NOVA CONTA'}</div>
              <h2>{recoveringPassword ? 'Redefinir senha' : authMode === 'signin' ? 'Entrar' : needsPassword ? 'Defina sua senha' : awaitingConfirmation ? 'Confirme seu e-mail' : isGuestLink ? 'Vincule seu convidado' : 'Criar sua conta'}</h2>
              {authMode === 'signup' && <p>{isGuestLink
                ? 'Seu jogador, dinheiro, veículos e corridas continuarão iguais. Primeiro enviaremos a confirmação do e-mail.'
                : needsPassword ? `E-mail ${account.email ?? email} confirmado. Falta apenas criar a senha.`
                  : awaitingConfirmation ? `Enviamos uma confirmação para ${account?.email ?? confirmationEmail ?? email}.${pendingEmail ? ' O progresso já está salvo na mesma conta de convidado.' : ''}`
                    : 'Crie uma conta para acessar o mesmo progresso em outros dispositivos.'}</p>}
            </div>

            {!needsPassword && !awaitingConfirmation && !recoveringPassword && <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>}
            {authMode === 'signin' && <label>{recoveringPassword ? 'Nova senha' : 'Senha'}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={recoveringPassword ? 'new-password' : 'current-password'} /></label>}
            {recoveringPassword && <label>Confirmar nova senha<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>}
            {authMode === 'signup' && !isGuestLink && !awaitingConfirmation && <>
              <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} /></label>
              <label>Confirmar senha<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} /></label>
            </>}

            {authMode === 'signin' && !recoveringPassword && <button className="primary-button" onClick={signIn} disabled={busy}>Entrar na minha conta</button>}
            {authMode === 'signin' && !recoveringPassword && <button className="auth-switch" onClick={recoverPassword} disabled={busy}>Esqueci minha senha</button>}
            {recoveringPassword && <button className="primary-button" onClick={finishPasswordRecovery} disabled={busy}>Salvar nova senha</button>}
            {authMode === 'signup' && awaitingConfirmation && <button className="primary-button" onClick={verifyConfirmation} disabled={busy}>Já confirmei o e-mail</button>}
            {authMode === 'signup' && !awaitingConfirmation && <button className="primary-button" onClick={createOrProtectAccount} disabled={busy}>{needsPassword ? 'Concluir e proteger progresso' : isGuestLink ? 'Vincular e-mail sem perder progresso' : 'Criar conta grátis'}</button>}
            {authMode === 'signin' && !recoveringPassword && <button className="auth-switch" onClick={() => openAuth('signup')}>Ainda não tenho conta</button>}
            {authMode === 'signup' && !needsPassword && !awaitingConfirmation && <button className="auth-switch" onClick={() => openAuth('signin')}>Já tenho uma conta</button>}
            <small role="status">{message || (isCloudEnabled ? 'Seu progresso local será sincronizado com segurança.' : 'Supabase opcional não configurado.')}</small>
          </div>
        )}
        <footer><span className="status-dot" /> Jogue offline • Progresso salvo neste dispositivo</footer>
      </section>
    </main>
  );
}
