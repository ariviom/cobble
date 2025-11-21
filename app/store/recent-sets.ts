'use client';

export type RecentSetEntry = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
  lastViewedAt: number;
};

const STORAGE_KEY = 'cobble_recent_sets_v1';
const MAX_RECENT = 100;

function loadRecentSetsUnsafe(): RecentSetEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it): RecentSetEntry | null => {
        if (!it || typeof it !== 'object') return null;
        const obj = it as Partial<RecentSetEntry> & {
          themeId?: unknown;
        };
        if (
          !obj.setNumber ||
          typeof obj.setNumber !== 'string' ||
          !obj.name ||
          typeof obj.name !== 'string'
        ) {
          return null;
        }
        const year =
          typeof obj.year === 'number' && Number.isFinite(obj.year)
            ? obj.year
            : 0;
        const numParts =
          typeof obj.numParts === 'number' && Number.isFinite(obj.numParts)
            ? obj.numParts
            : 0;
        const imageUrl =
          typeof obj.imageUrl === 'string' || obj.imageUrl === null
            ? obj.imageUrl
            : null;
        const themeId =
          typeof obj.themeId === 'number' && Number.isFinite(obj.themeId)
            ? obj.themeId
            : null;
        const lastViewedAt =
          typeof obj.lastViewedAt === 'number' && Number.isFinite(obj.lastViewedAt)
            ? obj.lastViewedAt
            : 0;
        return {
          setNumber: obj.setNumber,
          name: obj.name,
          year,
          imageUrl,
          numParts,
          themeId,
          lastViewedAt,
        };
      })
      .filter((x): x is RecentSetEntry => x !== null);
  } catch {
    return [];
  }
}

export function getRecentSets(): RecentSetEntry[] {
  const items = loadRecentSetsUnsafe();
  if (!items.length) return [];
  return [...items]
    .sort((a, b) => b.lastViewedAt - a.lastViewedAt)
    .slice(0, MAX_RECENT);
}

export function addRecentSet(entry: {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadRecentSetsUnsafe();
    const filtered = existing.filter(
      it => it.setNumber.toLowerCase() !== entry.setNumber.toLowerCase()
    );
    const next: RecentSetEntry[] = [
      {
        ...entry,
        lastViewedAt: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function removeRecentSet(setNumber: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadRecentSetsUnsafe();
    const next = existing.filter(
      it => it.setNumber.toLowerCase() !== setNumber.toLowerCase()
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}


