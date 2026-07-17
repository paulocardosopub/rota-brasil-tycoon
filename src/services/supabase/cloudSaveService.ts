import type { PlayerSave } from '../../types/game';
import { migrateSave, replaceSave } from '../storage/saveService';
import { supabase } from './client';

export interface CloudSaveConflict {
  local: PlayerSave;
  remote: PlayerSave;
  remoteUpdatedAt: string;
}

export async function findCloudSaveConflict(localSave: PlayerSave): Promise<CloudSaveConflict | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: remote, error } = await supabase.from('game_saves')
    .select('save_data, revision, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!remote?.save_data) return null;
  const remoteSave = migrateSave(remote.save_data);
  if (!savesDiverged(localSave, remoteSave)) return null;
  return { local: localSave, remote: remoteSave, remoteUpdatedAt: remote.updated_at };
}

export async function resolveCloudSaveConflict(conflict: CloudSaveConflict, choice: 'local' | 'cloud') {
  if (choice === 'cloud') {
    return replaceSave({ ...conflict.remote, lastCloudRevision: conflict.remote.revision });
  }
  if (!supabase) return conflict.local;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return conflict.local;
  const nextRevision = Math.max(conflict.local.revision, conflict.remote.revision) + 1;
  const next: PlayerSave = {
    ...conflict.local,
    revision: nextRevision,
    lastCloudRevision: nextRevision,
    updatedAt: new Date().toISOString()
  };
  const { error } = await supabase.from('game_saves').upsert(cloudRow(user.id, next));
  if (error) throw error;
  return replaceSave(next);
}

export async function syncCloudSave(localSave: PlayerSave): Promise<PlayerSave> {
  if (!supabase) return localSave;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return localSave;

  const { data: remote, error } = await supabase.from('game_saves')
    .select('save_data, revision, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;

  const remoteSave = remote?.save_data ? migrateSave(remote.save_data) : null;
  if (remoteSave && remote) {
    if (savesDiverged(localSave, remoteSave)) throw new Error('CLOUD_SAVE_CONFLICT');
    const remoteIsNewer = Number(remote.revision) > localSave.revision
      || (Number(remote.revision) === localSave.revision
        && new Date(remote.updated_at).getTime() > new Date(localSave.updatedAt).getTime());
    if (remoteIsNewer || isPristine(localSave)) {
      return replaceSave({ ...remoteSave, lastCloudRevision: remoteSave.revision });
    }
  }

  const next: PlayerSave = {
    ...localSave,
    lastCloudRevision: localSave.revision,
    updatedAt: new Date().toISOString()
  };
  const { error: upsertError } = await supabase.from('game_saves').upsert(cloudRow(user.id, next));
  if (upsertError) throw upsertError;
  // Background autosaves may finish out of order. The caller merges this
  // acknowledgement into the latest local snapshot instead of replacing it
  // with the older payload that happened to finish uploading.
  return next;
}

export async function forceCloudSave(localSave: PlayerSave): Promise<PlayerSave> {
  if (!supabase) return localSave;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return localSave;
  const next: PlayerSave = {
    ...localSave,
    lastCloudRevision: localSave.revision,
    updatedAt: new Date().toISOString()
  };
  const { error } = await supabase.from('game_saves').upsert(cloudRow(user.id, next));
  if (error) throw error;
  return replaceSave(next);
}

export function savesDiverged(local: PlayerSave, remote: PlayerSave) {
  if (isPristine(local)) return false;
  if (local.cloudLineageId !== remote.cloudLineageId) return true;
  if (sameSaveSnapshot(local, remote)) return false;
  const commonRevision = Math.max(0, local.lastCloudRevision);
  const localChanged = local.revision > commonRevision;
  const remoteChangedSinceLocalSync = remote.revision > commonRevision;
  return localChanged && remoteChangedSinceLocalSync;
}

function sameSaveSnapshot(local: PlayerSave, remote: PlayerSave) {
  if (local.revision !== remote.revision) return false;
  const localComparable = { ...local, updatedAt: '', lastCloudRevision: 0 };
  const remoteComparable = { ...remote, updatedAt: '', lastCloudRevision: 0 };
  return JSON.stringify(localComparable) === JSON.stringify(remoteComparable);
}

function cloudRow(userId: string, save: PlayerSave) {
  return {
    user_id: userId,
    save_version: save.saveVersion,
    revision: save.revision,
    save_data: save,
    updated_at: save.updatedAt
  };
}

function isPristine(save: PlayerSave) {
  return save.completedRides === 0 && save.ledger.length === 0 && save.fleet.vehicles.length === 1
    && save.fleet.employees.length === 0 && Math.abs(save.money - 100) < 0.001;
}
