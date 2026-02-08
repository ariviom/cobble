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

export type InventoryContextValue = {
  // Identity
  setNumber: string;
  setName: string | undefined;

  // Data
  rows: InventoryRow[];
  keys: string[];
  isLoading: boolean;
  error: Error | string | null;
  minifigStatusByKey: Map<string, MinifigStatus>;
  isMinifigEnriching: boolean;
  minifigEnrichmentError: Error | string | null;
  retryMinifigEnrichment: (() => void) | null;

  // Totals (pre-computed, excludes minifig parent rows)
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

  // UI Controls
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
  /** Get current controls state for saving (tab state persistence) */
  getControlsState: () => InventoryControlsState;

  // Derived
  sortedIndices: number[];
  colorOptions: string[];
  /** Colors that have matching pieces after display/category filters (for disabling unavailable options) */
  availableColors: Set<string>;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
  countsByParent: Record<string, number>;
  gridSizes: string;

  // Pricing
  pricesByKey: Record<string, PriceInfo> | null;
  pendingPriceKeys: Set<string> | null;
  requestPricesForKeys: ((keys: string[]) => void) | undefined;

  // Search Party
  broadcastPieceDelta: (payload: {
    key: string;
    delta: number;
    newOwned: number;
  }) => void;
  connectionState: 'disconnected' | 'connecting' | 'connected';
  hasConnectedOnce: boolean;
  isInGroupSession: boolean;

  // Pinned
  isPinned: (key: string) => boolean;
  togglePinned: (key: string) => void;
  getPinnedCount: () => number;

  // Bulk actions
  markAllMissing: () => void;
  markAllComplete: () => void;

  // Export helpers
  getMissingRows: () => MissingRow[];
  getAllRows: () => MissingRow[];

  // Export modal
  exportOpen: boolean;
  openExportModal: () => void;
  closeExportModal: () => void;

  // Enrichment toast
  showEnrichmentToast: boolean;
  dismissEnrichmentToast: () => void;

  // Tab visibility (for scroll restoration)
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function useInventoryContext(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error(
      'useInventoryContext must be used within an InventoryProvider'
    );
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
    isMinifigEnriching,
    minifigEnrichmentError,
    retryMinifigEnrichment,
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
  // Enrichment toast state
  // -------------------------------------------------------------------------
  const [toastDismissedForCycle, setToastDismissedForCycle] = useState(false);
  const [prevIsEnriching, setPrevIsEnriching] = useState(false);

  if (isMinifigEnriching && !prevIsEnriching) {
    setPrevIsEnriching(true);
    setToastDismissedForCycle(false);
  } else if (!isMinifigEnriching && prevIsEnriching) {
    setPrevIsEnriching(false);
  }

  const showEnrichmentToast =
    (isMinifigEnriching || !!minifigEnrichmentError) && !toastDismissedForCycle;

  const dismissEnrichmentToast = useCallback(() => {
    setToastDismissedForCycle(true);
  }, []);

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

  const {
    broadcastPieceDelta,
    broadcastOwnedSnapshot,
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
  });

  const hasBroadcastSnapshotRef = useRef(false);
  const hasClearedLocalForJoinerRef = useRef(false);

  // Clear local data for joiners
  useEffect(() => {
    if (enableCloudSync) return;
    if (!isInGroupSession) return;
    if (hasClearedLocalForJoinerRef.current) return;
    clearAllOwned(setNumber);
    hasClearedLocalForJoinerRef.current = true;
  }, [enableCloudSync, isInGroupSession, clearAllOwned, setNumber]);

  // Broadcast initial snapshot for hosts
  useEffect(() => {
    if (!enableCloudSync || !isInGroupSession) return;
    if (!isOwnedHydrated) return;
    if (hasBroadcastSnapshotRef.current) return;
    broadcastOwnedSnapshot(ownedByKey);
    hasBroadcastSnapshotRef.current = true;
  }, [
    enableCloudSync,
    isInGroupSession,
    isOwnedHydrated,
    ownedByKey,
    broadcastOwnedSnapshot,
  ]);

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
      })),
    [rows]
  );

  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------
  const value = useMemo<InventoryContextValue>(
    () => ({
      // Identity
      setNumber,
      setName,

      // Data
      rows,
      keys,
      isLoading,
      error,
      minifigStatusByKey,
      isMinifigEnriching,
      minifigEnrichmentError,
      retryMinifigEnrichment,

      // Totals
      totalRequired,
      totalMissing,
      ownedTotal,

      // Owned
      ownedByKey,
      handleOwnedChange,
      isOwnedHydrated,

      // Migration
      migration,
      isMigrating,
      confirmMigration,
      keepCloudData,

      // UI Controls
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

      // Derived
      sortedIndices,
      colorOptions,
      availableColors,
      parentOptions,
      subcategoriesByParent,
      countsByParent,
      gridSizes,

      // Pricing
      pricesByKey,
      pendingPriceKeys: pendingKeys,
      requestPricesForKeys: handlePricesForKeys,

      // Search Party
      broadcastPieceDelta,
      connectionState,
      hasConnectedOnce,
      isInGroupSession,

      // Pinned
      isPinned,
      togglePinned,
      getPinnedCount,

      // Bulk actions
      markAllMissing,
      markAllComplete,

      // Export helpers
      getMissingRows,
      getAllRows,

      // Export modal
      exportOpen,
      openExportModal,
      closeExportModal,

      // Enrichment toast
      showEnrichmentToast,
      dismissEnrichmentToast,

      // Tab visibility
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
      isMinifigEnriching,
      minifigEnrichmentError,
      retryMinifigEnrichment,
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
      pricesByKey,
      pendingKeys,
      handlePricesForKeys,
      broadcastPieceDelta,
      connectionState,
      hasConnectedOnce,
      isInGroupSession,
      isPinned,
      togglePinned,
      getPinnedCount,
      markAllMissing,
      markAllComplete,
      getMissingRows,
      getAllRows,
      exportOpen,
      openExportModal,
      closeExportModal,
      showEnrichmentToast,
      dismissEnrichmentToast,
      isActive,
    ]
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}
