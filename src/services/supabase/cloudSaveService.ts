import type { PlayerSave } from '../../types/game';
import { migrateSave, writeSave } from '../storage/saveService';
import { supabase } from './client';

export async function syncCloudSave(localSave: PlayerSave): Promise<PlayerSave> {
  if (!supabase) return localSave;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return localSave;

  const { data: remote, error } = await supabase
    .from('game_saves')
    .select('save_data, revision, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  const remoteSave = remote?.save_data ? migrateSave(remote.save_data) : null;
  if (remoteSave && remote) {
    const remoteIsNewer = Number(remote.revision) > localSave.revision ||
      (Number(remote.revision) === localSave.revision && new Date(remote.updated_at).getTime() > new Date(localSave.updatedAt).getTime());
    if (remoteIsNewer) return writeSave(remoteSave);
  }

  const next = { ...localSave, updatedAt: new Date().toISOString() };
  const { error: upsertError } = await supabase.from('game_saves').upsert({
    user_id: user.id,
    save_version: next.saveVersion,
    revision: next.revision,
    save_data: next,
    updated_at: next.updatedAt
  });
  if (upsertError) throw upsertError;
  return next;
}
