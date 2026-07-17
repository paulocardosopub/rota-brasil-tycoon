import type { User } from '@supabase/supabase-js';
import type { AccountLinkState } from '../../types/game';
import { supabase } from './client';

const ACCOUNT_SETUP_KEY = 'rbt_account_setup';
const PENDING_EMAIL_KEY = 'rbt_pending_email';

export type AccountStatus =
  | { kind: 'local'; email: null }
  | { kind: 'signed-out'; email: null }
  | { kind: 'anonymous'; email: null; userId: string }
  | { kind: 'pending-email'; email: string | null; userId: string }
  | { kind: 'needs-password'; email: string | null; userId: string }
  | { kind: 'permanent'; email: string | null; userId: string };

function accountRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function pendingEmail(user: Pick<User, 'email' | 'user_metadata'>) {
  const metadataEmail = user.user_metadata?.[PENDING_EMAIL_KEY];
  return typeof metadataEmail === 'string' ? metadataEmail : user.email ?? null;
}

export function accountLinkStateForUser(user: Pick<User, 'is_anonymous' | 'user_metadata'>): AccountLinkState {
  if (user.user_metadata?.[ACCOUNT_SETUP_KEY] === 'pending-password') return 'pending-email';
  return user.is_anonymous ? 'anonymous' : 'permanent';
}

export async function getAccountStatus(): Promise<AccountStatus> {
  if (!supabase) return { kind: 'local', email: null };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && error.name !== 'AuthSessionMissingError') throw error;
  if (!user) return { kind: 'signed-out', email: null };

  if (user.user_metadata?.[ACCOUNT_SETUP_KEY] === 'pending-password') {
    return user.is_anonymous
      ? { kind: 'pending-email', email: pendingEmail(user), userId: user.id }
      : { kind: 'needs-password', email: pendingEmail(user), userId: user.id };
  }
  return user.is_anonymous
    ? { kind: 'anonymous', email: null, userId: user.id }
    : { kind: 'permanent', email: user.email ?? null, userId: user.id };
}

export async function ensureGuestSession() {
  if (!supabase) return { kind: 'local' as const };
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return {
      kind: accountLinkStateForUser(session.user),
      userId: session.user.id
    };
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return { kind: 'anonymous' as const, userId: data.user?.id };
}

export async function signInPermanent(email: string, password: string) {
  if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function registerPermanentAccount(email: string, password: string) {
  if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED');
  const normalizedEmail = email.trim().toLowerCase();
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user.is_anonymous) {
    return requestGuestAccountLink(normalizedEmail);
  }
  if (session) throw new Error('ACCOUNT_ALREADY_SIGNED_IN');

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: accountRedirectUrl(),
      data: { [ACCOUNT_SETUP_KEY]: 'complete' }
    }
  });
  if (error) throw error;
  return { status: data.session ? 'linked' as const : 'verification-sent' as const };
}

export async function requestGuestAccountLink(email: string) {
  if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED');
  const normalizedEmail = email.trim().toLowerCase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.is_anonymous) throw new Error('ANONYMOUS_SESSION_REQUIRED');

  const { error } = await supabase.auth.updateUser({
    email: normalizedEmail,
    data: {
      ...user.user_metadata,
      [ACCOUNT_SETUP_KEY]: 'pending-password',
      [PENDING_EMAIL_KEY]: normalizedEmail
    }
  }, { emailRedirectTo: accountRedirectUrl() });
  if (error) throw error;
  return { status: 'verification-sent' as const };
}

export async function finishPermanentAccount(password: string) {
  if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) throw new Error('EMAIL_CONFIRMATION_REQUIRED');

  const { error } = await supabase.auth.updateUser({
    password,
    data: {
      ...user.user_metadata,
      [ACCOUNT_SETUP_KEY]: 'complete',
      [PENDING_EMAIL_KEY]: null
    }
  });
  if (error) throw error;
  return { status: 'linked' as const };
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
