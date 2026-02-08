'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { SyncWorker } from '@/app/lib/sync/SyncWorker';
import type { SyncWorkerStatus } from '@/app/lib/sync/types';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

type SyncContextValue = SyncWorkerStatus & {
  syncNow: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: PropsWithChildren) {
  const { user } = useSupabaseUser();
  const workerRef = useRef<SyncWorker | null>(null);
  const [status, setStatus] = useState<SyncWorkerStatus>({
    isReady: false,
    isAvailable: false,
    pendingSyncCount: 0,
    isSyncing: false,
    lastSyncError: null,
    isLeader: true,
  });

  useEffect(() => {
    const worker = new SyncWorker();
    workerRef.current = worker;

    const unsubscribe = worker.subscribe(setStatus);
    void worker.init();

    return () => {
      unsubscribe();
      worker.destroy();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    workerRef.current?.setUserId(user?.id ?? null);
  }, [user?.id]);

  const syncNow = async () => {
    await workerRef.current?.performSync();
  };

  return (
    <SyncContext.Provider value={{ ...status, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}

/**
 * Optional hook for sync status. Returns null if outside SyncProvider.
 */
export function useSyncStatus(): SyncContextValue | null {
  return useContext(SyncContext);
}
