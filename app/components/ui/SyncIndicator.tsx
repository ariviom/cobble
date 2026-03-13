'use client';

import { useSyncStatus } from '@/app/components/providers/sync-provider';
import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useEffect, useRef, useState } from 'react';

type IndicatorState = 'hidden' | 'syncing' | 'synced' | 'pending' | 'error';

export function SyncIndicator() {
  const { user } = useSupabaseUser();
  const { hasFeature } = useEntitlements();
  const sync = useSyncStatus();
  const [state, setState] = useState<IndicatorState>('hidden');
  const [visible, setVisible] = useState(false);
  const prevSyncingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Extract values (may be null if outside provider or not Plus)
  const isSyncing = sync?.isSyncing ?? false;
  const pendingSyncCount = sync?.pendingSyncCount ?? 0;
  const lastSyncError = sync?.lastSyncError ?? null;
  const syncNow = sync?.syncNow;
  const shouldShow = !!user && hasFeature('sync.cloud') && !!sync;

  // Derive indicator state
  useEffect(() => {
    if (!shouldShow) {
      setState('hidden');
      setVisible(false);
      return;
    }

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = undefined;
    }

    if (lastSyncError) {
      setState('error');
      setVisible(true);
    } else if (isSyncing) {
      setState('syncing');
      setVisible(true);
      prevSyncingRef.current = true;
    } else if (prevSyncingRef.current) {
      // Just finished syncing — show "Synced" briefly
      prevSyncingRef.current = false;
      setState('synced');
      setVisible(true);
      dismissTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, 1500);
    } else if (pendingSyncCount > 0) {
      setState('pending');
      setVisible(true);
    } else {
      setState('hidden');
      setVisible(false);
    }

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [shouldShow, isSyncing, pendingSyncCount, lastSyncError]);

  // Gate: only render for authenticated Plus users
  if (!shouldShow || !visible) return null;

  const handleClick = () => {
    if ((state === 'error' || state === 'pending') && syncNow) {
      void syncNow();
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={handleClick}
      className={`fixed right-4 bottom-20 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium shadow-lg transition-all duration-300 ease-out ${
        state === 'error'
          ? 'cursor-pointer bg-red-100 text-red-800 dark:bg-red-900/80 dark:text-red-200'
          : state === 'pending'
            ? 'cursor-pointer bg-amber-100 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200'
            : state === 'synced'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/80 dark:text-green-200'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
      } ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} `}
    >
      {state === 'syncing' && (
        <>
          <SyncingIcon />
          <span>Syncing...</span>
        </>
      )}
      {state === 'synced' && (
        <>
          <CheckIcon />
          <span>Synced</span>
        </>
      )}
      {state === 'pending' && (
        <>
          <CloudIcon />
          <span>{pendingSyncCount}</span>
        </>
      )}
      {state === 'error' && (
        <>
          <WarningIcon />
          <span>Sync failed</span>
        </>
      )}
    </div>
  );
}

function SyncingIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
