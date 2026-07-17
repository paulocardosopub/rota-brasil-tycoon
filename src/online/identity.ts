import type { PublicAvatarId } from '../types/game';

export function normalizeDriverName(value: string) {
  const normalized = value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length >= 3 && normalized.length <= 20 ? normalized : null;
}

export function publicIdentityPayload(input: {
  publicPlayerId: string;
  driverName: string;
  avatarId: PublicAvatarId;
  fleetPublicId: string | null;
  fleetName: string | null;
  fleetColor: string | null;
}) {
  const driverName = normalizeDriverName(input.driverName);
  if (!driverName) throw new Error('PUBLIC_NAME_INVALID');
  return { ...input, driverName };
}
