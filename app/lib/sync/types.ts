export type SyncWorkerStatus = {
  isReady: boolean;
  isAvailable: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  lastSyncError: string | null;
  isLeader: boolean;
};

export type StatusListener = (status: SyncWorkerStatus) => void;
