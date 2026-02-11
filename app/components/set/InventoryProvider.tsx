'use client';

import { useGroupSessionChannel } from '@/app/hooks/useGroupSessionChannel';
import type { MinifigStatus } from '@/app/hooks/useInventory';
import type { InventoryControlsState } from '@/app/hooks/useInventoryControls';
import { useInventoryPrices } from '@/app/hooks/useInventoryPrices';
import { useInventoryViewModel } from '@/app/hooks/useInventoryViewModel';
import { useSupabaseOwned } from '@/app/hooks/useSupabaseOwned';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { clampOwned, computeMissing } from './inventory-utils';
import type {
  GroupBy,
  InventoryFilter,
  InventoryRow,
  ItemSize,
  SortKey,
  ViewType,
} from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PriceInfo = {
  unitPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  pricingSource?: 'real_time' | 'historical' | 'unavailable';
  pricing_source?: 'real_time' | 'historical' | 'unavailable';
  lastUpdatedAt?: string | null;
  nextRefreshAt?: string | null;
  scopeLabel?: string | null;
  bricklinkColorId: number | null;
  itemType: 'PART' | 'MINIFIG';
};

type PriceSummary = {
  total: number;
  minTotal: number | null;
  maxTotal: number | null;
  currency: string | null;
  pricedItemCount: number;
};

// ---------------------------------------------------------------------------
// Focused Context Types
// ---------------------------------------------------------------------------

export type InventoryDataContextValue = {
  // Identity
  setNumber: string;
  setName: string | undefined;
  // Data
  rows: InventoryRow[];
  keys: string[];
  isLoading: boolean;
  error: Error | string | null;
  minifigStatusByKey: Map<string, MinifigStatus>;
  // Totals
  totalRequired: number;
  totalMissing: number;
  ownedTotal: number;
  // Owned state
  ownedByKey: Record<string, number>;
  handleOwnedChange: (key: string, nextOwned: number) => void;
  isOwnedHydrated: boolean;
  // Migration
  migration: {
    open: boolean;
    localTotal: number;
    supabaseTotal: number;
  } | null;
  isMigrating: boolean;
  confirmMigration: () => Promise<void>;
  keepCloudData: () => Promise<void>;
  // Bulk actions
  markAllMissing: () => void;
  markAllComplete: () => void;
  // Search Party
  broadcastPieceDelta: (payload: {
    key: string;
    delta: number;
    newOwned: number;
  }) => void;
  connectionState: 'disconnected' | 'connecting' | 'connected';
  hasConnectedOnce: boolean;
  isInGroupSession: boolean;
  // Tab visibility
  isActive: boolean;
};

export type InventoryControlsContextValue = {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  filter: InventoryFilter;
  view: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
  setSortKey: (key: SortKey) => void;
  setSortDir: (dir: 'asc' | 'desc') => void;
  setFilter: (filter: InventoryFilter) => void;
  setView: (view: ViewType) => void;
  setItemSize: (size: ItemSize) => void;
  setGroupBy: (group: GroupBy) => void;
  getControlsState: () => InventoryControlsState;
  sortedIndices: number[];
  colorOptions: string[];
  availableColors: Set<string>;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
  countsByParent: Record<string, number>;
  gridSizes: string;
};

export type InventoryPricingContextValue = {
  pricesByKey: Record<string, PriceInfo> | null;
  pendingPriceKeys: Set<string> | null;
  requestPricesForKeys: ((keys: string[]) => void) | undefined;
};

export type InventoryPinnedContextValue = {
  isPinned: (key: string) => boolean;
  togglePinned: (key: string) => void;
  getPinnedCount: () => number;
};

export type InventoryUIContextValue = {
  exportOpen: boolean;
  openExportModal: () => void;
  closeExportModal: () => void;
  getMissingRows: () => MissingRow[];
  getAllRows: () => MissingRow[];
};

// ---------------------------------------------------------------------------
// Focused Context Objects
// ---------------------------------------------------------------------------

const InventoryDataContext = createContext<InventoryDataContextValue | null>(
  null
);
const InventoryControlsContext =
  createContext<InventoryControlsContextValue | null>(null);
const InventoryPricingContext =
  createContext<InventoryPricingContextValue | null>(null);
const InventoryPinnedContext =
  createContext<InventoryPinnedContextValue | null>(null);
const InventoryUIContext = createContext<InventoryUIContextValue | null>(null);

// ---------------------------------------------------------------------------
// Focused Context Hooks
// ---------------------------------------------------------------------------

export function useInventoryData(): InventoryDataContextValue {
  const ctx = useContext(InventoryDataContext);
  if (!ctx) {
    throw new Error(
      'useInventoryData must be used within an InventoryProvider'
    );
  }
  return ctx;
}

/** Returns inventory data context or null when rendered outside InventoryProvider. */
export function useOptionalInventoryData(): InventoryDataContextValue | null {
  return useContext(InventoryDataContext);
}

export function useInventoryControls(): InventoryControlsContextValue {
  const ctx = useContext(InventoryControlsContext);
  if (!ctx) {
    throw new Error(
      'useInventoryControls must be used within an InventoryProvider'
    );
  }
  return ctx;
}

export function useInventoryPricing(): InventoryPricingContextValue {
  const ctx = useContext(InventoryPricingContext);
  if (!ctx) {
    throw new Error(
      'useInventoryPricing must be used within an InventoryProvider'
    );
  }
  return ctx;
}

export function useInventoryPinned(): InventoryPinnedContextValue {
  const ctx = useContext(InventoryPinnedContext);
  if (!ctx) {
    throw new Error(
      'useInventoryPinned must be used within an InventoryProvider'
    );
  }
  return ctx;
}

export function useInventoryUI(): InventoryUIContextValue {
  const ctx = useContext(InventoryUIContext);
  if (!ctx) {
    throw new Error('useInventoryUI must be used within an InventoryProvider');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider Props
// ---------------------------------------------------------------------------

export type InventoryProviderProps = {
  setNumber: string;
  setName?: string;
  initialInventory?: InventoryRow[] | null;
  /** Initial controls state for tab restoration */
  initialControlsState?: Partial<InventoryControlsState> | undefined;
  enableCloudSync?: boolean;
  /** Whether this tab is currently visible (controls scroll restoration) */
  isActive?: boolean;
  groupSessionId?: string | null;
  groupParticipantId?: string | null;
  groupClientId?: string | null;
  onParticipantPiecesDelta?: (
    participantId: string | null,
    delta: number
  ) => void;
  onPriceStatusChange?: (
    status: 'idle' | 'loading' | 'loaded' | 'error'
  ) => void;
  onPriceTotalsChange?: (summary: PriceSummary | null) => void;
  children: ReactNode;
};

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

export function InventoryProvider({
  setNumber,
  setName,
  initialInventory,
  initialControlsState,
  enableCloudSync = true,
  isActive = true,
  groupSessionId,
  groupParticipantId,
  groupClientId,
  onParticipantPiecesDelta,
  onPriceStatusChange,
  onPriceTotalsChange,
  children,
}: InventoryProviderProps) {
  // -------------------------------------------------------------------------
  // Core inventory data & UI controls
  // -------------------------------------------------------------------------
  const {
    rows,
    isLoading,
    error,
    keys,
    ownedByKey,
    minifigStatusByKey,
    totalRequired,
    totalMissing,
    ownedTotal,
    isOwnedHydrated,
    sortKey,
    sortDir,
    filter,
    view,
    itemSize,
    groupBy,
    setSortKey,
    setSortDir,
    setFilter,
    setView,
    setItemSize,
    setGroupBy,
    getControlsState,
    sortedIndices,
    subcategoriesByParent,
    colorOptions,
    availableColors,
    countsByParent,
    parentOptions,
    gridSizes,
  } = useInventoryViewModel(setNumber, {
    initialRows: initialInventory ?? null,
    initialControlsState,
  });

  // -------------------------------------------------------------------------
  // Export modal state
  // -------------------------------------------------------------------------
  const [exportOpen, setExportOpen] = useState(false);
  const openExportModal = useCallback(() => setExportOpen(true), []);
  const closeExportModal = useCallback(() => setExportOpen(false), []);

  // -------------------------------------------------------------------------
  // Pricing
  // -------------------------------------------------------------------------
  const { pricesByKey, pendingKeys, requestPricesForKeys } =
    useInventoryPrices<PriceInfo>({
      setNumber,
      rows,
      keys,
      ...(onPriceStatusChange ? { onPriceStatusChange } : {}),
      ...(onPriceTotalsChange ? { onPriceTotalsChange } : {}),
    });

  const handlePricesForKeys = useMemo(
    () =>
      requestPricesForKeys
        ? (targetKeys: string[]) => {
            if (targetKeys.length === 0) return;
            void requestPricesForKeys(targetKeys);
          }
        : undefined,
    [requestPricesForKeys]
  );

  // -------------------------------------------------------------------------
  // Pinned store
  // -------------------------------------------------------------------------
  const pinnedStore = usePinnedStore();

  const isPinned = useCallback(
    (key: string) => pinnedStore.isPinned(setNumber, key),
    [pinnedStore, setNumber]
  );

  const togglePinned = useCallback(
    (key: string) =>
      pinnedStore.togglePinned({
        setNumber,
        key,
        ...(setName ? { setName } : {}),
      }),
    [pinnedStore, setNumber, setName]
  );

  const getPinnedCount = useCallback(
    () => pinnedStore.getPinnedKeysForSet(setNumber).length,
    [pinnedStore, setNumber]
  );

  // -------------------------------------------------------------------------
  // Cloud sync (Supabase) + bulk actions
  // -------------------------------------------------------------------------
  const {
    handleOwnedChange: handleOwnedChangeBase,
    markAllComplete,
    markAllMissing,
    migration,
    isMigrating,
    confirmMigration,
    keepCloudData,
  } = useSupabaseOwned({
    setNumber,
    rows,
    keys,
    enableCloudSync,
  });

  // Direct store access only for group session joiner cleanup (local-only)
  const clearAllOwned = useOwnedStore(state => state.clearAll);

  // -------------------------------------------------------------------------
  // Group session (Search Party)
  // -------------------------------------------------------------------------
  const isInGroupSession =
    Boolean(groupSessionId) &&
    Boolean(groupParticipantId) &&
    Boolean(groupClientId);

  // Stable refs for snapshot handshake callbacks (avoids circular deps)
  const ownedByKeyRef = useRef(ownedByKey);
  ownedByKeyRef.current = ownedByKey;
  const broadcastOwnedSnapshotRef = useRef<
    (owned: Record<string, number>) => void
  >(() => {});
  const requestSnapshotRef = useRef<() => void>(() => {});

  const handleSnapshotRequested = useCallback(() => {
    if (!enableCloudSync || !isInGroupSession) return;
    broadcastOwnedSnapshotRef.current(ownedByKeyRef.current);
  }, [enableCloudSync, isInGroupSession]);

  const handleReconnected = useCallback(() => {
    if (enableCloudSync) {
      // Host: proactively broadcast snapshot on reconnect
      broadcastOwnedSnapshotRef.current(ownedByKeyRef.current);
    } else {
      // Joiner: ask host for current state
      requestSnapshotRef.current();
    }
  }, [enableCloudSync]);

  const {
    broadcastPieceDelta,
    broadcastOwnedSnapshot,
    requestSnapshot,
    connectionState,
    hasConnectedOnce,
  } = useGroupSessionChannel({
    enabled: isInGroupSession,
    sessionId: groupSessionId ?? null,
    setNumber,
    participantId: groupParticipantId ?? null,
    clientId: groupClientId ?? '',
    onRemoteDelta: payload => {
      handleOwnedChangeBase(payload.key, payload.newOwned);
    },
    onRemoteSnapshot: snapshot => {
      if (!snapshot || typeof snapshot !== 'object') return;
      Object.entries(snapshot).forEach(([key, value]) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        handleOwnedChangeBase(key, value);
      });
    },
    ...(onParticipantPiecesDelta ? { onParticipantPiecesDelta } : {}),
    onSnapshotRequested: handleSnapshotRequested,
    onReconnected: handleReconnected,
  });

  // Keep refs in sync after hook returns
  broadcastOwnedSnapshotRef.current = broadcastOwnedSnapshot;
  requestSnapshotRef.current = requestSnapshot;

  const hasClearedLocalForJoinerRef = useRef(false);

  // Clear local data for joiners
  useEffect(() => {
    if (enableCloudSync) return;
    if (!isInGroupSession) return;
    if (hasClearedLocalForJoinerRef.current) return;
    clearAllOwned(setNumber);
    hasClearedLocalForJoinerRef.current = true;
  }, [enableCloudSync, isInGroupSession, clearAllOwned, setNumber]);

  // -------------------------------------------------------------------------
  // Combined owned change handler (local + broadcast)
  // Note: Minifig cascade (parent ↔ children sync) is handled in useSupabaseOwned
  // -------------------------------------------------------------------------
  const handleOwnedChange = useCallback(
    (key: string, nextOwned: number) => {
      const row = rows.find(r => r.inventoryKey === key);
      const maxQty = row?.quantityRequired ?? 999;
      const clamped = clampOwned(nextOwned, maxQty);
      const prevOwned = ownedByKey[key] ?? 0;

      // handleOwnedChangeBase handles minifig cascade (parent ↔ children)
      handleOwnedChangeBase(key, clamped);

      if (isInGroupSession) {
        broadcastPieceDelta({
          key,
          delta: clamped - prevOwned,
          newOwned: clamped,
        });
      }
    },
    [
      rows,
      ownedByKey,
      handleOwnedChangeBase,
      isInGroupSession,
      broadcastPieceDelta,
    ]
  );

  // -------------------------------------------------------------------------
  // Export helpers
  // -------------------------------------------------------------------------
  const getMissingRows = useCallback(
    (): MissingRow[] =>
      rows.map((row, idx) => {
        const key = keys[idx]!;
        return {
          setNumber: row.setNumber,
          partId: row.partId,
          colorId: row.colorId,
          elementId: row.elementId ?? null,
          quantityMissing: computeMissing(
            row.quantityRequired ?? 0,
            ownedByKey[key] ?? 0
          ),
          identity: row.identity,
          quantityRequired: row.quantityRequired ?? 0,
        };
      }),
    [rows, keys, ownedByKey]
  );

  const getAllRows = useCallback(
    (): MissingRow[] =>
      rows.map(row => ({
        setNumber: row.setNumber,
        partId: row.partId,
        colorId: row.colorId,
        elementId: row.elementId ?? null,
        quantityMissing: row.quantityRequired ?? 0,
        identity: row.identity,
        quantityRequired: row.quantityRequired ?? 0,
      })),
    [rows]
  );

  // -------------------------------------------------------------------------
  // Focused context values
  // -------------------------------------------------------------------------

  const dataValue = useMemo<InventoryDataContextValue>(
    () => ({
      setNumber,
      setName,
      rows,
      keys,
      isLoading,
      error,
      minifigStatusByKey,
      totalRequired,
      totalMissing,
      ownedTotal,
      ownedByKey,
      handleOwnedChange,
      isOwnedHydrated,
      migration,
      isMigrating,
      confirmMigration,
      keepCloudData,
      markAllMissing,
      markAllComplete,
      broadcastPieceDelta,
      connectionState,
      hasConnectedOnce,
      isInGroupSession,
      isActive,
    }),
    [
      setNumber,
      setName,
      rows,
      keys,
      isLoading,
      error,
      minifigStatusByKey,
      totalRequired,
      totalMissing,
      ownedTotal,
      ownedByKey,
      handleOwnedChange,
      isOwnedHydrated,
      migration,
      isMigrating,
      confirmMigration,
      keepCloudData,
      markAllMissing,
      markAllComplete,
      broadcastPieceDelta,
      connectionState,
      hasConnectedOnce,
      isInGroupSession,
      isActive,
    ]
  );

  const controlsValue = useMemo<InventoryControlsContextValue>(
    () => ({
      sortKey,
      sortDir,
      filter,
      view,
      itemSize,
      groupBy,
      setSortKey,
      setSortDir,
      setFilter,
      setView,
      setItemSize,
      setGroupBy,
      getControlsState,
      sortedIndices,
      colorOptions,
      availableColors,
      parentOptions,
      subcategoriesByParent,
      countsByParent,
      gridSizes,
    }),
    [
      sortKey,
      sortDir,
      filter,
      view,
      itemSize,
      groupBy,
      setSortKey,
      setSortDir,
      setFilter,
      setView,
      setItemSize,
      setGroupBy,
      getControlsState,
      sortedIndices,
      colorOptions,
      availableColors,
      parentOptions,
      subcategoriesByParent,
      countsByParent,
      gridSizes,
    ]
  );

  const pricingValue = useMemo<InventoryPricingContextValue>(
    () => ({
      pricesByKey,
      pendingPriceKeys: pendingKeys,
      requestPricesForKeys: handlePricesForKeys,
    }),
    [pricesByKey, pendingKeys, handlePricesForKeys]
  );

  const pinnedValue = useMemo<InventoryPinnedContextValue>(
    () => ({
      isPinned,
      togglePinned,
      getPinnedCount,
    }),
    [isPinned, togglePinned, getPinnedCount]
  );

  const uiValue = useMemo<InventoryUIContextValue>(
    () => ({
      exportOpen,
      openExportModal,
      closeExportModal,
      getMissingRows,
      getAllRows,
    }),
    [exportOpen, openExportModal, closeExportModal, getMissingRows, getAllRows]
  );

  return (
    <InventoryDataContext.Provider value={dataValue}>
      <InventoryControlsContext.Provider value={controlsValue}>
        <InventoryPricingContext.Provider value={pricingValue}>
          <InventoryPinnedContext.Provider value={pinnedValue}>
            <InventoryUIContext.Provider value={uiValue}>
              {children}
            </InventoryUIContext.Provider>
          </InventoryPinnedContext.Provider>
        </InventoryPricingContext.Provider>
      </InventoryControlsContext.Provider>
    </InventoryDataContext.Provider>
  );
}
