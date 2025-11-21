'use client';

export type RecentSearchEntry = {
  query: string;
  lastSearchedAt: number;
};

const STORAGE_KEY = 'cobble_recent_searches_v1';
const MAX_RECENT = 50;

function loadRecentSearchesUnsafe(): RecentSearchEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it): RecentSearchEntry | null => {
        if (!it || typeof it !== 'object') return null;
        const obj = it as Partial<RecentSearchEntry>;
        if (!obj.query || typeof obj.query !== 'string') return null;
        const q = obj.query.trim();
        if (!q) return null;
        const lastSearchedAt =
          typeof obj.lastSearchedAt === 'number' &&
          Number.isFinite(obj.lastSearchedAt)
            ? obj.lastSearchedAt
            : 0;
        return { query: q, lastSearchedAt };
      })
      .filter((x): x is RecentSearchEntry => x !== null);
  } catch {
    return [];
  }
}

export function getRecentSearches(): RecentSearchEntry[] {
  const items = loadRecentSearchesUnsafe();
  if (!items.length) return [];
  return [...items]
    .sort((a, b) => b.lastSearchedAt - a.lastSearchedAt)
    .slice(0, MAX_RECENT);
}

export function addRecentSearch(query: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = query.trim();
  if (!trimmed) return;
  try {
    const existing = loadRecentSearchesUnsafe();
    const lower = trimmed.toLowerCase();
    const filtered = existing.filter(
      it => it.query.toLowerCase() !== lower
    );
    const next: RecentSearchEntry[] = [
      {
        query: trimmed,
        lastSearchedAt: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}


