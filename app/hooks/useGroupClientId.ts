'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'quarry_group_client_id_v1';

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `client_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

/**
 * Returns a stable, per-browser identifier used for Search Together sessions.
 * The value is stored in localStorage so participants can be recognized when
 * they disconnect and rejoin from the same device.
 */
export function useGroupClientId(): string | null {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing && typeof existing === 'string') {
        setClientId(existing);
        return;
      }

      const next = generateClientId();
      window.localStorage.setItem(STORAGE_KEY, next);
      setClientId(next);
    } catch {
      // If localStorage is unavailable, fall back to an in-memory ID for this
      // session. This will not persist across reloads, but keeps the feature
      // usable.
      setClientId(prev => prev ?? generateClientId());
    }
  }, []);

  return clientId;
}





