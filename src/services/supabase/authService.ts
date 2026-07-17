import { supabase } from './client';

export async function ensureGuestSession() {
  if (!supabase) return { kind: 'local' as const };
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return { kind: session.user.is_anonymous ? 'anonymous' as const : 'permanent' as const, userId: session.user.id };
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return { kind: 'anonymous' as const, userId: data.user?.id };
}

export async function signInPermanent(email: string, password: string) {
  if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

export async function linkOrCreatePermanentAccount(email: string, password: string) {
  if (!supabase) throw new Error('CLOUD_NOT_CONFIGURED');
  const normalizedEmail = email.trim().toLowerCase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user.is_anonymous) {
    const { error } = await supabase.auth.updateUser({ email: normalizedEmail });
    if (error) throw error;
    return { status: 'verification-sent' as const };
  }
  if (session?.user.email?.toLowerCase() === normalizedEmail) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { status: 'linked' as const };
  }
  const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
  if (error) throw error;
  return { status: data.session ? 'linked' as const : 'verification-sent' as const };
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
