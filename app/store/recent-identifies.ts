'use client';

import {
  readStorage,
  removeStorage,
  writeStorage,
} from '@/app/lib/persistence/storage';

export type IdentifySource = 'camera' | 'text';

export type RecentIdentifyEntry = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  isMinifig: boolean;
  setsFound: number;
  lastIdentifiedAt: number;
  source: IdentifySource;
};

const STORAGE_KEY = 'brick_party_recent_identifies_v2';
const MAX_RECENT = 20;

function loadRecentIdentifiesUnsafe(): RecentIdentifyEntry[] {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it): RecentIdentifyEntry | null => {
        if (!it || typeof it !== 'object') return null;
        const obj = it as Partial<RecentIdentifyEntry>;
        if (!obj.partNum || typeof obj.partNum !== 'string') {
          return null;
        }
        // Use partNum as fallback display name when name is empty/missing
        const name =
          typeof obj.name === 'string' && obj.name ? obj.name : obj.partNum;
        const imageUrl =
          typeof obj.imageUrl === 'string' || obj.imageUrl === null
            ? obj.imageUrl
            : null;
        const isMinifig =
          typeof obj.isMinifig === 'boolean' ? obj.isMinifig : false;
        const setsFound =
          typeof obj.setsFound === 'number' && Number.isFinite(obj.setsFound)
            ? obj.setsFound
            : 0;
        const lastIdentifiedAt =
          typeof obj.lastIdentifiedAt === 'number' &&
          Number.isFinite(obj.lastIdentifiedAt)
            ? obj.lastIdentifiedAt
            : 0;
        const source: IdentifySource =
          obj.source === 'camera' || obj.source === 'text'
            ? obj.source
            : 'camera';
        return {
          partNum: obj.partNum,
          name,
          imageUrl,
          isMinifig,
          setsFound,
          lastIdentifiedAt,
          source,
        };
      })
      .filter((x): x is RecentIdentifyEntry => x !== null);
  } catch {
    return [];
  }
}

export function getRecentIdentifies(
  source?: IdentifySource
): RecentIdentifyEntry[] {
  const items = loadRecentIdentifiesUnsafe();
  if (!items.length) return [];
  const filtered = source ? items.filter(it => it.source === source) : items;
  return [...filtered]
    .sort((a, b) => b.lastIdentifiedAt - a.lastIdentifiedAt)
    .slice(0, MAX_RECENT);
}

export function addRecentIdentify(entry: {
  partNum: string;
  name: string;
  imageUrl: string | null;
  isMinifig: boolean;
  setsFound: number;
  source: IdentifySource;
}): void {
  try {
    const existing = loadRecentIdentifiesUnsafe();
    const filtered = existing.filter(
      it => it.partNum.toLowerCase() !== entry.partNum.toLowerCase()
    );
    const next: RecentIdentifyEntry[] = [
      {
        ...entry,
        lastIdentifiedAt: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT);
    writeStorage(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function clearRecentIdentifies(): void {
  removeStorage(STORAGE_KEY);
}
