'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Modal } from '@/app/components/ui/Modal';
import { Spinner } from '@/app/components/ui/Spinner';
import { Toast } from '@/app/components/ui/Toast';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { clampOwned, computeMissing } from './inventory-utils';
import { InventoryControls } from './InventoryControls';
import { InventoryItem } from './items/InventoryItem';
import type {
  GroupBy,
  InventoryFilter,
  InventoryRow,
  ItemSize,
  SortKey,
  ViewType,
} from './types';

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

export type InventoryTableProps = {
  setNumber: string;
  setName?: string;
  initialInventory?: InventoryRow[] | null;
  enableCloudSync?: boolean;
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
};

type InventoryTableViewProps = {
  setNumber: string;
  setName?: string;
  rows: InventoryRow[];
  keys: string[];
  ownedByKey: Record<string, number>;
  isLoading: boolean;
  error: Error | string | null;
  isMinifigEnriching: boolean;
  minifigEnrichmentError: Error | string | null;
  retryMinifigEnrichment: (() => void) | null;
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
  sortedIndices: number[];
  subcategoriesByParent: Record<string, string[]>;
  colorOptions: string[];
  countsByParent: Record<string, number>;
  parentOptions: string[];
  gridSizes: string;
  exportOpen: boolean;
  showEnrichmentToast: boolean;
  setShowEnrichmentToast: (show: boolean) => void;
  handleExportOpen: { open: () => void; close: () => void };
  pricesByKey: Record<string, PriceInfo> | null;
  pendingPriceKeys: Set<string> | null;
  requestPricesForKeys?: (keys: string[]) => void;
  pinnedStore: {
    toggle: (key: string) => void;
    isPinned: (key: string) => boolean;
  };
  handleOwnedChange: (key: string, nextOwned: number) => void;
  migration: {
    open: boolean;
    localTotal: number;
    supabaseTotal: number;
  } | null;
  isMigrating: boolean;
  confirmMigration: () => Promise<void>;
  keepCloudData: () => Promise<void>;
  broadcastPieceDelta: (payload: {
    key: string;
    delta: number;
    newOwned: number;
  }) => void;
};

export function InventoryTableView({
  setNumber,
  setName,
  rows,
  keys,
  ownedByKey,
  isLoading,
  error,
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
  sortedIndices,
  subcategoriesByParent,
  colorOptions,
  countsByParent,
  parentOptions,
  gridSizes,
  exportOpen,
  showEnrichmentToast,
  setShowEnrichmentToast,
  handleExportOpen,
  pricesByKey,
  pendingPriceKeys,
  requestPricesForKeys,
  pinnedStore,
  handleOwnedChange,
  migration,
  isMigrating,
  confirmMigration,
  keepCloudData,
  broadcastPieceDelta,
}: InventoryTableViewProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isMinifigEnriching) {
      setShowEnrichmentToast(true);
    }
  }, [isMinifigEnriching, setShowEnrichmentToast]);

  const renderInventoryItem = useCallback(
    (rowIndex: number, key: string) => {
      const row = rows[rowIndex]!;
      const priceInfo = pricesByKey ? pricesByKey[key] : null;
      const missingQty = computeMissing(
        row.quantityRequired ?? 0,
        ownedByKey[key] ?? 0
      );

      return (
        <InventoryItem
          key={key}
          setNumber={setNumber}
          row={row}
          owned={ownedByKey[key] ?? 0}
          missing={missingQty}
          unitPrice={priceInfo?.unitPrice ?? null}
          minPrice={priceInfo?.minPrice ?? null}
          maxPrice={priceInfo?.maxPrice ?? null}
          currency={priceInfo?.currency ?? null}
          pricingSource={
            priceInfo?.pricingSource ?? priceInfo?.pricing_source ?? null
          }
          bricklinkColorId={priceInfo?.bricklinkColorId ?? null}
          isPricePending={pendingPriceKeys?.has(key) ?? false}
          canRequestPrice={Boolean(
            !pendingPriceKeys?.has(key) &&
              !pricesByKey?.[key] &&
              requestPricesForKeys
          )}
          {...(requestPricesForKeys
            ? { onRequestPrice: () => requestPricesForKeys([key]) }
            : {})}
          onOwnedChange={nextOwned => {
            const clamped = clampOwned(nextOwned, row.quantityRequired ?? 0);
            const prevOwned = ownedByKey[key] ?? 0;
            handleOwnedChange(key, clamped);
            broadcastPieceDelta({
              key,
              delta: clamped - prevOwned,
              newOwned: clamped,
            });
          }}
          isPinned={pinnedStore.isPinned(key)}
          onTogglePinned={() => pinnedStore.toggle(key)}
          isEnriching={isMinifigEnriching}
        />
      );
    },
    [
      rows,
      pricesByKey,
      ownedByKey,
      setNumber,
      pendingPriceKeys,
      requestPricesForKeys,
      handleOwnedChange,
      broadcastPieceDelta,
      pinnedStore,
      isMinifigEnriching,
    ]
  );

  // Note: List view is intentionally non-virtualized to avoid height/measurement
  // drift when item sizes change (size toggle, enrichment). Re-enabling would
  // require: size-aware estimates, measureElement/ResizeObserver, remeasure on
  // view/size changes, and likely gating by a row-count threshold.
  const listRows = useMemo(() => {
    if (view !== 'list') return null;
    return sortedIndices.map(rowIndex => {
      const key = keys[rowIndex]!;
      return (
        <div
          key={key}
          className="w-full px-2 pb-2"
          data-view="list"
          data-item-size={itemSize}
        >
          {renderInventoryItem(rowIndex, key)}
        </div>
      );
    });
  }, [view, sortedIndices, keys, itemSize, renderInventoryItem]);

  const gridRows = useMemo(() => {
    if (view !== 'grid') return null;
    return sortedIndices.map(rowIndex => {
      const key = keys[rowIndex]!;
      return (
        <div key={key} data-view="grid" data-item-size={itemSize}>
          {renderInventoryItem(rowIndex, key)}
        </div>
      );
    });
  }, [view, sortedIndices, keys, itemSize, renderInventoryItem]);

  const getMissingRows = useMemo(
    () => (): MissingRow[] =>
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

  return (
    <div className="flex h-full flex-col">
      <InventoryControls
        setNumber={setNumber}
        {...(setName ? { setName } : {})}
        sortKey={sortKey}
        sortDir={sortDir}
        filter={filter}
        view={view}
        itemSize={itemSize}
        groupBy={groupBy}
        onChangeSortKey={setSortKey}
        onToggleSortDir={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
        onChangeFilter={setFilter}
        onChangeView={setView}
        onChangeItemSize={setItemSize}
        onChangeGroupBy={setGroupBy}
        colorOptions={colorOptions}
        parentCounts={countsByParent}
        parentOptions={parentOptions}
        subcategoriesByParent={subcategoriesByParent}
        onToggleColor={color => {
          const exists = filter.colors.includes(color);
          setFilter({
            ...filter,
            colors: exists
              ? filter.colors.filter(c => c !== color)
              : [...filter.colors, color],
          });
        }}
        onOpenExportModal={handleExportOpen.open}
      />

      {error ? (
        <ErrorBanner
          message={
            typeof error === 'string'
              ? error
              : (error?.message ?? 'Failed to load inventory')
          }
        />
      ) : null}

      {!isLoading && rows.length === 0 ? (
        <EmptyState message="No parts found. Try adjusting your filters or search for another set." />
      ) : (
        <div
          ref={scrollerRef}
          className="relative flex-1 overflow-auto bg-background"
          data-view={view}
          data-item-size={itemSize}
        >
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <>
              {view === 'list' ? (
                <div
                  className="flex flex-col py-3"
                  data-view="list"
                  data-item-size={itemSize}
                >
                  {listRows}
                </div>
              ) : (
                <div
                  className={`grid ${gridSizes} gap-2 p-3`}
                  data-view="grid"
                  data-item-size={itemSize}
                >
                  {gridRows}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {showEnrichmentToast && isMinifigEnriching ? (
          <Toast
            title="Enriching minifigs…"
            description="Fetching images and subparts."
            variant="info"
            onClose={() => setShowEnrichmentToast(false)}
          />
        ) : null}
        {minifigEnrichmentError ? (
          <Toast
            title="Minifig enrichment failed"
            description="Retry to fetch missing images or subparts."
            variant="error"
            {...(retryMinifigEnrichment
              ? { actionLabel: 'Retry', onAction: retryMinifigEnrichment }
              : {})}
            onClose={() => setShowEnrichmentToast(false)}
          />
        ) : null}
      </div>

      <ExportModal
        open={exportOpen}
        onClose={handleExportOpen.close}
        {...(setName ? { setName } : {})}
        setNumber={setNumber}
        getMissingRows={getMissingRows}
      />

      <Modal
        open={migration?.open ?? false}
        onClose={() => {
          // no-op: force a decision
        }}
        title="Sync your owned pieces"
      >
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Choose whether to keep your Supabase data or push your local data.
          </p>
          <p>Local total: {migration?.localTotal ?? 0}</p>
          <p>Supabase total: {migration?.supabaseTotal ?? 0}</p>
          <div className="flex gap-3">
            <Button disabled={isMigrating} onClick={confirmMigration}>
              Push local to Supabase
            </Button>
            <Button
              variant="secondary"
              disabled={isMigrating}
              onClick={keepCloudData}
            >
              Keep Supabase data
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
