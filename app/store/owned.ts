'use client';

import { create } from 'zustand';
import { readStorage, writeStorage } from '@/app/lib/persistence/storage';

export type OwnedState = {
  getOwned: (setNumber: string, key: string) => number;
  setOwned: (setNumber: string, key: string, qty: number) => void;
  clearAll: (setNumber: string) => void;
  markAllAsOwned: (
    setNumber: string,
    keys: string[],
    quantities: number[]
  ) => void;
  _version: number; // Version counter for triggering re-renders
};

const STORAGE_PREFIX = 'brick_party_owned_';
const STORAGE_VERSION_SUFFIX = '_v1';
const WRITE_DEBOUNCE_MS = 500; // longer debounce per UX guidance

function storageKey(setNumber: string) {
  return `${STORAGE_PREFIX}${setNumber}${STORAGE_VERSION_SUFFIX}`;
}

// Simple in-memory cache to avoid repeated localStorage reads per render cycle
const cache: Map<string, Record<string, number>> = new Map();

// Debounced write scheduling per setNumber
const pendingWrites: Map<string, Record<string, number>> = new Map();
const writeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

function flushWriteNow(setNumber: string) {
  const data = pendingWrites.get(setNumber);
  if (!data) return;
  writeStorage(storageKey(setNumber), JSON.stringify(data));
  pendingWrites.delete(setNumber);
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

  // Flush all pending writes synchronously
  for (const setNumber of pendingWrites.keys()) {
    flushWriteNow(setNumber);
  }
}

function scheduleWrite(setNumber: string) {
  const existing = writeTimers.get(setNumber);
  if (existing) clearTimeout(existing);
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
  }, WRITE_DEBOUNCE_MS);
  writeTimers.set(setNumber, timer);
}

function read(setNumber: string): Record<string, number> {
  const cached = cache.get(setNumber);
  if (cached) return cached;
  const raw = readStorage(storageKey(setNumber));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    cache.set(setNumber, parsed);
    return parsed;
  } catch {
    return {};
  }
}

function write(setNumber: string, data: Record<string, number>) {
  // Update in-memory cache immediately for responsive reads
  cache.set(setNumber, data);
  pendingWrites.set(setNumber, data);
  scheduleWrite(setNumber);
}

export const useOwnedStore = create<OwnedState>(set => ({
  _version: 0,
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
