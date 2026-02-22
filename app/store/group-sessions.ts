'use client';

import {
  readStorage,
  writeStorage,
  removeStorage,
} from '@/app/lib/persistence/storage';

export type StoredGroupSession = {
  sessionId: string;
  slug: string;
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
  themeId: number | null;
  participantId: string;
  role: 'host' | 'joiner';
  joinedAt: number; // Date.now() timestamp
  piecesFound?: number;
  participantCount?: number;
  leaderboardPosition?: number;
};

const STORAGE_KEY = 'brick_party_group_sessions_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadSessionsRaw(): StoredGroupSession[] {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is StoredGroupSession =>
        !!it &&
        typeof it === 'object' &&
        typeof (it as StoredGroupSession).slug === 'string' &&
        typeof (it as StoredGroupSession).sessionId === 'string' &&
        typeof (it as StoredGroupSession).setNumber === 'string' &&
        typeof (it as StoredGroupSession).joinedAt === 'number'
    );
  } catch {
    return [];
  }
}

function save(sessions: StoredGroupSession[]): void {
  try {
    writeStorage(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore storage errors
  }
}

function clearStale(sessions: StoredGroupSession[]): StoredGroupSession[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return sessions.filter(s => s.joinedAt > cutoff);
}

export function getStoredGroupSessions(): StoredGroupSession[] {
  const all = loadSessionsRaw();
  const fresh = clearStale(all);
  // Persist cleanup if stale entries were removed
  if (fresh.length !== all.length) {
    save(fresh);
  }
  return fresh;
}

export function getStoredGroupSessionBySetNumber(
  setNumber: string
): StoredGroupSession | null {
  const sessions = getStoredGroupSessions();
  return (
    sessions.find(s => s.setNumber.toLowerCase() === setNumber.toLowerCase()) ??
    null
  );
}

export function storeGroupSession(session: StoredGroupSession): void {
  const existing = loadSessionsRaw();
  // Replace any existing entry for this slug
  const filtered = existing.filter(s => s.slug !== session.slug);
  save(clearStale([...filtered, session]));
}

export function clearStoredGroupSession(slug: string): void {
  const existing = loadSessionsRaw();
  save(existing.filter(s => s.slug !== slug));
}

export function updateStoredGroupSessionStats(
  slug: string,
  stats: Pick<
    StoredGroupSession,
    'piecesFound' | 'participantCount' | 'leaderboardPosition'
  >
): void {
  const sessions = loadSessionsRaw();
  const idx = sessions.findIndex(s => s.slug === slug);
  if (idx === -1) return;
  sessions[idx] = { ...sessions[idx], ...stats };
  save(sessions);
}

export function clearAllStoredGroupSessions(): void {
  save([]);
}

// ---------------------------------------------------------------------------
// Joiner owned state persistence (localStorage bridge for refresh resilience)
// ---------------------------------------------------------------------------

const JOINER_OWNED_PREFIX = 'brick_party_sp_owned_';

export function storeJoinerOwnedState(
  sessionId: string,
  owned: Record<string, number>
): void {
  writeStorage(`${JOINER_OWNED_PREFIX}${sessionId}`, JSON.stringify(owned));
}

export function getJoinerOwnedState(
  sessionId: string
): Record<string, number> | null {
  const raw = readStorage(`${JOINER_OWNED_PREFIX}${sessionId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null;
    return parsed as Record<string, number>;
  } catch {
    return null;
  }
}

export function clearJoinerOwnedState(sessionId: string): void {
  removeStorage(`${JOINER_OWNED_PREFIX}${sessionId}`);
}
