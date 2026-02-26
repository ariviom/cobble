'use client';

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

// Microtask-batched write scheduling per setNumber
const pendingWrites: Map<string, Record<string, number>> = new Map();
const scheduledMicrotasks: Set<string> = new Set();
let consecutiveWriteFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

// Track ongoing hydration to prevent duplicate calls
const hydrationPromises: Map<string, Promise<void>> = new Map();

// Epoch counter: incremented on resetOwnedCache to invalidate in-flight async ops
let cacheEpoch = 0;

// Track if IndexedDB is available (checked once on init)
let storageAvailable: boolean | null = null;

function checkStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  storageAvailable = isIndexedDBAvailable();
  return storageAvailable;
}

// ---------------------------------------------------------------------------
// localStorage fallback for unload safety (iOS Safari kills async on unload)
// ---------------------------------------------------------------------------
const PENDING_WRITES_LS_KEY = 'brick_party_pending_owned';

/**
 * Synchronously snapshot all pending writes to localStorage.
 * Safety net: if the page is killed before async IndexedDB writes land,
 * we recover from localStorage on next page load.
 */
function savePendingToLocalStorage(): void {
  if (pendingWrites.size === 0) return;
  try {
    const payload: Record<string, Record<string, number>> = {};
    for (const [setNumber, data] of pendingWrites) {
      payload[setNumber] = data;
    }
    localStorage.setItem(PENDING_WRITES_LS_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be full or unavailable — best effort only
  }
}

function clearPendingLocalStorage(): void {
  try {
    localStorage.removeItem(PENDING_WRITES_LS_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Replay pending writes saved to localStorage on a previous unload.
 * Writes them into IndexedDB then clears the key.
 * Runs once; awaited by the first hydrateFromIndexedDB call to guarantee
 * IndexedDB is up-to-date before any set reads.
 */
let reconcilePromise: Promise<void> | null = null;

function reconcilePendingFromLocalStorage(): Promise<void> {
  if (reconcilePromise) return reconcilePromise;

  reconcilePromise = (async () => {
    try {
      const raw = localStorage.getItem(PENDING_WRITES_LS_KEY);
      if (!raw) return;

      const payload = JSON.parse(raw) as Record<string, Record<string, number>>;
      const setNumbers = Object.keys(payload);
      if (setNumbers.length === 0) {
        clearPendingLocalStorage();
        return;
      }

      if (!checkStorageAvailable()) {
        // Can't write to IndexedDB — leave localStorage for next attempt
        return;
      }

      const promises = setNumbers.map(setNumber =>
        setOwnedForSet(setNumber, payload[setNumber]!).catch(err => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[owned] Failed to reconcile pending writes for ${setNumber}:`,
              err
            );
          }
        })
      );
      await Promise.all(promises);

      clearPendingLocalStorage();
    } catch {
      // JSON parse failure or other error — clear corrupt data
      clearPendingLocalStorage();
    }
  })();

  return reconcilePromise;
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

  // Capture epoch to detect cache resets during async write
  const myEpoch = cacheEpoch;

  try {
    await setOwnedForSet(setNumber, data);
    // Cache was reset while writing — don't touch module state
    if (myEpoch !== cacheEpoch) return;
    pendingWrites.delete(setNumber);
    consecutiveWriteFailures = 0;
    // Clear localStorage fallback when all pending writes have landed
    if (pendingWrites.size === 0) clearPendingLocalStorage();
  } catch (error) {
    // Cache was reset while writing — discard
    if (myEpoch !== cacheEpoch) return;

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[owned] Failed to flush data to IndexedDB:', error);
    }
    consecutiveWriteFailures++;
    if (consecutiveWriteFailures >= MAX_CONSECUTIVE_FAILURES) {
      storageAvailable = false;
      useOwnedStore.setState({ _storageAvailable: false });
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
 *
 * Synchronously snapshots pending data to localStorage first so that if
 * the browser kills the page before the async IndexedDB writes complete
 * (common on iOS Safari), the data survives and is reconciled on next load.
 */
function flushAllPendingWrites() {
  // Clear scheduled microtasks to prevent double-writes
  scheduledMicrotasks.clear();

  // Synchronous safety net — survives even if the page is killed immediately
  savePendingToLocalStorage();

  // Attempt async IndexedDB writes (may not complete on unload)
  for (const setNumber of pendingWrites.keys()) {
    flushWriteToIndexedDB(setNumber)
      .then(() => {
        // If all pending writes flushed successfully, clear the LS fallback
        if (pendingWrites.size === 0) clearPendingLocalStorage();
      })
      .catch(() => {
        // Swallow errors on unload — localStorage fallback has us covered
      });
  }
}

/**
 * Flush all pending writes and wait for them to complete.
 * Use this before reading from IndexedDB to ensure consistency.
 */
export async function flushPendingWritesAsync(): Promise<void> {
  scheduledMicrotasks.clear();

  const promises: Promise<void>[] = [];
  for (const setNumber of pendingWrites.keys()) {
    promises.push(flushWriteToIndexedDB(setNumber));
  }
  await Promise.all(promises);
}

/**
 * Reset all in-memory owned caches. Called on auth change so the next user
 * hydrates fresh from IndexedDB + Supabase comparison.
 */
export async function resetOwnedCache(): Promise<void> {
  // 1. Flush any pending writes for the outgoing user
  await flushPendingWritesAsync();

  // 2. Invalidate any in-flight async operations (hydration, writes)
  cacheEpoch++;

  // 3. Clear all module-level state
  cache.clear();
  pendingWrites.clear();
  scheduledMicrotasks.clear();
  consecutiveWriteFailures = 0;
  storageAvailable = null;
  hydrationPromises.clear();
  reconcilePromise = null;

  // 4. Reset Zustand state so sets re-hydrate on next access
  useOwnedStore.setState({
    _version: 0,
    _hydratedSets: new Set<string>(),
    _storageAvailable: true,
  });
}

function scheduleWrite(setNumber: string) {
  if (storageAvailable === false) return;
  if (scheduledMicrotasks.has(setNumber)) return;
  scheduledMicrotasks.add(setNumber);
  queueMicrotask(() => {
    scheduledMicrotasks.delete(setNumber);
    flushWriteNow(setNumber);
  });
}

/**
 * Read owned data for a set from in-memory cache.
 * Returns empty object if not yet hydrated - UI should show loading state.
 */
function read(setNumber: string): Record<string, number> {
  return cache.get(setNumber) ?? {};
}

/**
 * Public read access to the owned cache — O(1) Map lookup.
 * Used by `useOwnedSnapshot` to avoid rebuilding the object key-by-key.
 */
export const readOwnedCache = read;

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
      // Capture epoch to detect cache resets during async work
      const myEpoch = cacheEpoch;

      // Ensure any pending writes saved to localStorage on a previous
      // page unload have been flushed to IndexedDB before we read.
      await reconcilePendingFromLocalStorage();
      if (myEpoch !== cacheEpoch) return; // Cache was reset during reconcile

      // Check storage availability and update state if needed
      const available = checkStorageAvailable();
      if (!available) {
        // No IndexedDB - mark as hydrated with empty data (in-memory only mode)
        if (myEpoch !== cacheEpoch) return; // Cache was reset; discard
        set(state => ({
          ...state,
          _storageAvailable: false,
          _hydratedSets: new Set([...state._hydratedSets, setNumber]),
        }));
        return;
      }

      try {
        const indexedDBData = await getOwnedForSet(setNumber);

        // Cache was reset while we were reading — discard stale data
        if (myEpoch !== cacheEpoch) return;

        // Update in-memory cache with IndexedDB data
        cache.set(setNumber, indexedDBData);

        // Mark as hydrated and trigger re-render
        set(state => ({
          ...state,
          _version: state._version + 1,
          _hydratedSets: new Set([...state._hydratedSets, setNumber]),
        }));
      } catch (error) {
        // Cache was reset while we were reading — discard
        if (myEpoch !== cacheEpoch) return;

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
