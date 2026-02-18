'use client';

import type { MinifigStatus } from '@/app/hooks/useInventory';
import type { InventoryControlsState } from '@/app/hooks/useInventoryControls';
import { useInventoryPrices } from '@/app/hooks/useInventoryPrices';
import { useInventoryViewModel } from '@/app/hooks/useInventoryViewModel';
import { useSupabaseOwned } from '@/app/hooks/useSupabaseOwned';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { usePinnedStore } from '@/app/store/pinned';
import {
  createContext,
  useCallback,
  useContext,
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
  RarityTier,
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
  scrollerKey: string;
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
  rarityByIndex: Array<RarityTier | null>;
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

export type OwnedOverride = {
  ownedByKey: Record<string, number>;
  setOwned: (key: string, value: number) => void;
  /** Apply multiple updates in a single state transition (avoids O(n²) spreads). */
  setBatch: (updates: Record<string, number>) => void;
  clearAll: () => void;
};

export type InventoryProviderProps = {
  setNumber: string;
  setName?: string;
  /** Unique key for the data-inventory-scroller attribute (defaults to setNumber) */
  scrollerKey?: string;
  initialInventory?: InventoryRow[] | null;
  /** Initial controls state for tab restoration */
  initialControlsState?: Partial<InventoryControlsState> | undefined;
  enableCloudSync?: boolean;
  /** When provided, owned state is ephemeral (not persisted to store). Used by SP joiner tabs. */
  ownedOverride?: OwnedOverride | undefined;
  /** Whether this tab is currently visible (controls scroll restoration) */
  isActive?: boolean;
  /** Ref kept in sync with current ownedByKey — lets external code read state. */
  ownedByKeyRef?: React.MutableRefObject<Record<string, number>>;
  /** Ref exposing handleOwnedChangeBase — lets external code apply owned changes. */
  applyOwnedRef?: React.MutableRefObject<(key: string, value: number) => void>;
  /** Fires after a user-initiated owned change (clamped). */
  onAfterOwnedChange?:
    | ((key: string, newValue: number, prevValue: number) => void)
    | undefined;
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
  scrollerKey: scrollerKeyProp,
  initialInventory,
  initialControlsState,
  enableCloudSync = true,
  ownedOverride,
  isActive = true,
  ownedByKeyRef,
  applyOwnedRef,
  onAfterOwnedChange,
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
    rarityByIndex,
    subcategoriesByParent,
    colorOptions,
    availableColors,
    countsByParent,
    parentOptions,
    gridSizes,
  } = useInventoryViewModel(setNumber, {
    initialRows: initialInventory ?? null,
    initialControlsState,
    ownedByKeyOverride: ownedOverride?.ownedByKey,
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
    handleOwnedChange: storeOwnedChange,
    markAllComplete: storeMarkAllComplete,
    markAllMissing: storeMarkAllMissing,
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

  // When ownedOverride is provided, writes go to ephemeral state instead of
  // the persistent store. Use a ref so handleOwnedChangeBase stays stable.
  const ownedOverrideRef = useRef(ownedOverride);
  ownedOverrideRef.current = ownedOverride;

  const handleOwnedChangeBase = useCallback(
    (key: string, value: number) => {
      if (ownedOverrideRef.current) {
        ownedOverrideRef.current.setOwned(key, value);
      } else {
        storeOwnedChange(key, value);
      }
    },
    [storeOwnedChange]
  );

  const markAllComplete = useCallback(() => {
    if (ownedOverrideRef.current) {
      const updates: Record<string, number> = {};
      for (let i = 0; i < keys.length; i++) {
        updates[keys[i]!] = rows[i]!.quantityRequired;
      }
      ownedOverrideRef.current.setBatch(updates);
    } else {
      storeMarkAllComplete();
    }
  }, [keys, rows, storeMarkAllComplete]);

  const markAllMissing = useCallback(() => {
    if (ownedOverrideRef.current) {
      ownedOverrideRef.current.clearAll();
    } else {
      storeMarkAllMissing();
    }
  }, [storeMarkAllMissing]);

  // -------------------------------------------------------------------------
  // Sync refs for external consumers (e.g., Search Party channel layer)
  // -------------------------------------------------------------------------
  if (ownedByKeyRef) ownedByKeyRef.current = ownedByKey;
  if (applyOwnedRef) applyOwnedRef.current = handleOwnedChangeBase;

  // -------------------------------------------------------------------------
  // Combined owned change handler
  // Note: Minifig cascade (parent ↔ children sync) is handled in useSupabaseOwned
  // -------------------------------------------------------------------------
  // Use a ref for ownedByKey so handleOwnedChange doesn't re-create on every edit
  const ownedByKeyStableRef = useRef(ownedByKey);
  ownedByKeyStableRef.current = ownedByKey;

  const handleOwnedChange = useCallback(
    (key: string, nextOwned: number) => {
      const row = rows.find(r => r.inventoryKey === key);
      const maxQty = row?.quantityRequired ?? 999;
      const clamped = clampOwned(nextOwned, maxQty);
      const prevOwned = ownedByKeyStableRef.current[key] ?? 0;

      handleOwnedChangeBase(key, clamped);
      onAfterOwnedChange?.(key, clamped, prevOwned);
    },
    [rows, handleOwnedChangeBase, onAfterOwnedChange]
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

  const scrollerKey = scrollerKeyProp ?? setNumber;

  const dataValue = useMemo<InventoryDataContextValue>(
    () => ({
      setNumber,
      setName,
      scrollerKey,
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
      isActive,
    }),
    [
      setNumber,
      setName,
      scrollerKey,
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
      rarityByIndex,
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
      rarityByIndex,
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
