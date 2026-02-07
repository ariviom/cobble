'use client';

import {
  OWNED_WRITE_DEBOUNCE_HIDDEN_MS,
  OWNED_WRITE_DEBOUNCE_MS,
} from '@/app/config/timing';
import {
  getOwnedForSet,
  isIndexedDBAvailable,
  setOwnedForSet,
} from '@/app/lib/localDb';
import { create } from 'zustand';

export type OwnedState = {
  getOwned: (setNumber: string, key: string) => number;
  setOwned: (setNumber: string, key: string, qty: number) => void;
  clearAll: (setNumber: string) => void;
  markAllAsOwned: (
    setNumber: string,
    keys: string[],
    quantities: number[]
  ) => void;
  /** Hydrate owned data for a set from IndexedDB (async, call on set page load) */
  hydrateFromIndexedDB: (setNumber: string) => Promise<void>;
  /** Check if a set has been hydrated from IndexedDB */
  isHydrated: (setNumber: string) => boolean;
  /** Check if IndexedDB is available (false means in-memory only mode) */
  isStorageAvailable: () => boolean;
  _version: number; // Version counter for triggering re-renders
  /** Track which sets have been hydrated from IndexedDB */
  _hydratedSets: Set<string>;
  /** Whether IndexedDB is available for persistence */
  _storageAvailable: boolean;
};

// Simple in-memory cache - this is the synchronous read source
const cache: Map<string, Record<string, number>> = new Map();
const CACHE_MAX_ENTRIES = 400;

// Debounced write scheduling per setNumber
const pendingWrites: Map<string, Record<string, number>> = new Map();
const writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// Track ongoing hydration to prevent duplicate calls
const hydrationPromises: Map<string, Promise<void>> = new Map();

// Track if IndexedDB is available (checked once on init)
let storageAvailable: boolean | null = null;

function checkStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  storageAvailable = isIndexedDBAvailable();
  return storageAvailable;
}

/**
 * Flush writes to IndexedDB.
 */
async function flushWriteToIndexedDB(setNumber: string): Promise<void> {
  const data = pendingWrites.get(setNumber);
  if (!data) return;

  if (!checkStorageAvailable()) {
    // In-memory only mode - just clear the pending write
    pendingWrites.delete(setNumber);
    return;
  }

  try {
    await setOwnedForSet(setNumber, data);
    pendingWrites.delete(setNumber);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[owned] Failed to flush data to IndexedDB:', error);
    }
    // Keep in pending writes for retry on next flush
  }
}

/**
 * Flush a single set's pending writes to IndexedDB.
 */
function flushWriteNow(setNumber: string) {
  // Fire-and-forget async write to IndexedDB
  flushWriteToIndexedDB(setNumber).catch(error => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[owned] Failed to persist data:', error);
    }
  });
}

/**
 * Flush all pending writes immediately. Called on page unload/visibility change
 * to prevent data loss from debounced writes that haven't been persisted yet.
 */
function flushAllPendingWrites() {
  // Clear all timers first to prevent double-writes
  for (const timer of writeTimers.values()) {
    clearTimeout(timer);
  }
  writeTimers.clear();

  // Flush all pending writes (fire-and-forget since we're unloading)
  for (const setNumber of pendingWrites.keys()) {
    flushWriteToIndexedDB(setNumber).catch(() => {
      // Swallow errors on unload - nothing we can do
    });
  }
}

/**
 * Flush all pending writes and wait for them to complete.
 * Use this before reading from IndexedDB to ensure consistency.
 */
export async function flushPendingWritesAsync(): Promise<void> {
  for (const timer of writeTimers.values()) {
    clearTimeout(timer);
  }
  writeTimers.clear();

  const promises: Promise<void>[] = [];
  for (const setNumber of pendingWrites.keys()) {
    promises.push(flushWriteToIndexedDB(setNumber));
  }
  await Promise.all(promises);
}

function scheduleWrite(setNumber: string) {
  const existing = writeTimers.get(setNumber);
  if (existing) clearTimeout(existing);
  const debounceMs =
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
      ? OWNED_WRITE_DEBOUNCE_HIDDEN_MS
      : OWNED_WRITE_DEBOUNCE_MS;
  const timer = setTimeout(() => {
    // Prefer idle time when available
    const idle =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? (
            window as Window & {
              requestIdleCallback?: (
                cb: () => void,
                opts?: { timeout?: number }
              ) => number;
            }
          ).requestIdleCallback
        : undefined;
    if (typeof idle === 'function') {
      try {
        idle(() => flushWriteNow(setNumber), { timeout: 1000 });
      } catch {
        flushWriteNow(setNumber);
      }
    } else {
      flushWriteNow(setNumber);
    }
    writeTimers.delete(setNumber);
  }, debounceMs);
  writeTimers.set(setNumber, timer);
}

/**
 * Read owned data for a set from in-memory cache.
 * Returns empty object if not yet hydrated - UI should show loading state.
 */
function read(setNumber: string): Record<string, number> {
  return cache.get(setNumber) ?? {};
}

/**
 * Write owned data for a set.
 * Updates in-memory cache immediately, then schedules async persistence to IndexedDB.
 */
function write(setNumber: string, data: Record<string, number>) {
  // Update in-memory cache immediately for responsive reads
  cache.set(setNumber, data);
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  pendingWrites.set(setNumber, data);
  scheduleWrite(setNumber);
}

export const useOwnedStore = create<OwnedState>((set, get) => ({
  _version: 0,
  _hydratedSets: new Set<string>(),
  _storageAvailable: true, // Assume true until checked

  isHydrated: (setNumber: string) => {
    return get()._hydratedSets.has(setNumber);
  },

  isStorageAvailable: () => {
    return checkStorageAvailable();
  },

  getOwned: (setNumber, key) => {
    const state = read(setNumber);
    return state[key] ?? 0;
  },

  setOwned: (setNumber, key, qty) => {
    const state = read(setNumber);
    const nextQty = Math.max(0, Math.floor(qty || 0));
    const updated: Record<string, number> =
      nextQty === 0
        ? (() => {
            const rest = { ...state };
            delete rest[key];
            return rest;
          })()
        : { ...state, [key]: nextQty };
    write(setNumber, updated);
    // Increment version to trigger re-renders for components subscribed to _version
    set(state => ({ ...state, _version: (state._version ?? 0) + 1 }));
  },

  clearAll: setNumber => {
    write(setNumber, {});
    set(state => ({ ...state, _version: (state._version ?? 0) + 1 }));
  },

  markAllAsOwned: (setNumber, keys, quantities) => {
    const data: Record<string, number> = {};
    for (let i = 0; i < keys.length; i++) {
      const q = Math.max(0, Math.floor(quantities[i] ?? 0));
      if (q > 0) data[keys[i]!] = q;
    }
    write(setNumber, data);
    set(state => ({ ...state, _version: (state._version ?? 0) + 1 }));
  },

  hydrateFromIndexedDB: async (setNumber: string) => {
    // Check if already hydrated
    const currentState = useOwnedStore.getState();
    if (currentState._hydratedSets.has(setNumber)) {
      return;
    }

    // Check if hydration is already in progress
    const existingPromise = hydrationPromises.get(setNumber);
    if (existingPromise) {
      return existingPromise;
    }

    // Start hydration
    const hydrationPromise = (async () => {
      // Check storage availability and update state if needed
      const available = checkStorageAvailable();
      if (!available) {
        // No IndexedDB - mark as hydrated with empty data (in-memory only mode)
        set(state => ({
          ...state,
          _storageAvailable: false,
          _hydratedSets: new Set([...state._hydratedSets, setNumber]),
        }));
        return;
      }

      try {
        const indexedDBData = await getOwnedForSet(setNumber);

        // Update in-memory cache with IndexedDB data
        cache.set(setNumber, indexedDBData);

        // Mark as hydrated and trigger re-render
        set(state => ({
          ...state,
          _version: state._version + 1,
          _hydratedSets: new Set([...state._hydratedSets, setNumber]),
        }));
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[owned] Failed to hydrate from IndexedDB:', error);
        }
        // Mark storage as unavailable and hydrated (in-memory only mode)
        storageAvailable = false;
        set(state => ({
          ...state,
          _storageAvailable: false,
          _hydratedSets: new Set([...state._hydratedSets, setNumber]),
        }));
      } finally {
        hydrationPromises.delete(setNumber);
      }
    })();

    hydrationPromises.set(setNumber, hydrationPromise);
    return hydrationPromise;
  },
}));

// Register global event listeners to flush pending writes on page unload/hide.
// This prevents data loss when the user navigates away before debounce completes.
if (typeof window !== 'undefined') {
  // beforeunload: fires when page is about to unload (navigation, close tab)
  window.addEventListener('beforeunload', () => {
    flushAllPendingWrites();
  });

  // visibilitychange: fires when page goes to background (tab switch, minimize)
  // This is important on mobile where pages may be killed without beforeunload
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAllPendingWrites();
    }
  });

  // pagehide: Safari/iOS doesn't always fire beforeunload reliably
  window.addEventListener('pagehide', () => {
    flushAllPendingWrites();
  });
}
