'use client';

import { readStorage } from '@/app/lib/persistence/storage';
import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'brick_party_keep_awake_v1';

/** Read the keep-awake preference from localStorage. */
export function getKeepAwake(): boolean {
  return readStorage(STORAGE_KEY) === 'true';
}

/**
 * Request a Screen Wake Lock while the page is visible.
 *
 * Reads the `brick_party_keep_awake_v1` localStorage flag. When enabled
 * (and the browser supports the API), acquires a WakeLockSentinel that
 * prevents the device from sleeping. The lock is automatically released
 * when the tab is backgrounded and re-acquired when it becomes visible
 * again (required by the Wake Lock API spec).
 */
export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    if (!getKeepAwake()) return;

    let released = false;

    const acquire = async () => {
      if (released) return;
      try {
        sentinelRef.current = await navigator.wakeLock.request('screen');
        sentinelRef.current.addEventListener('release', () => {
          sentinelRef.current = null;
        });
      } catch {
        // Acquire can fail if the tab is not visible or permission denied.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, []);
}
