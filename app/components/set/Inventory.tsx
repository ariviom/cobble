'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Modal } from '@/app/components/ui/Modal';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampOwned, computeMissing } from './inventory-utils';
import {
  useInventoryData,
  useInventoryControls,
  useInventoryPricing,
  useInventoryPinned,
  useInventoryUI,
} from './InventoryProvider';
import { InventoryItem } from './items/InventoryItem';
import { useOptionalSearchParty } from './SearchPartyProvider';
import {
  InventoryItemModal,
  type InventoryItemModalData,
} from './items/InventoryItemModal';

export function Inventory() {
  const {
    setNumber,
    setName,
    rows,
    keys,
    ownedByKey,
    minifigStatusByKey,
    isLoading,
    error,
    handleOwnedChange,
    scrollerKey,
    migration,
    isMigrating,
    confirmMigration,
    keepCloudData,
  } = useInventoryData();
  const sp = useOptionalSearchParty();
  const isInGroupSession = sp?.isInGroupSession ?? false;
  const { view, itemSize, sortedIndices, rarityByIndex, gridSizes } =
    useInventoryControls();
  const { pricesByKey, pendingPriceKeys, requestPricesForKeys } =
    useInventoryPricing();
  const { isPinned, togglePinned } = useInventoryPinned();
  const { exportOpen, closeExportModal, getMissingRows, getAllRows } =
    useInventoryUI();

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // Auto-request price when modal opens
  useEffect(() => {
    if (!selectedItemKey) return;
    const priceInfo = pricesByKey ? pricesByKey[selectedItemKey] : null;
    const hasPrice =
      typeof priceInfo?.unitPrice === 'number' &&
      Number.isFinite(priceInfo.unitPrice);
    const hasRange =
      typeof priceInfo?.minPrice === 'number' &&
      typeof priceInfo?.maxPrice === 'number';
    const isPending = pendingPriceKeys?.has(selectedItemKey) ?? false;
    const canRequest =
      !isPending && !pricesByKey?.[selectedItemKey] && requestPricesForKeys;

    if (!hasPrice && !hasRange && !isPending && canRequest) {
      requestPricesForKeys([selectedItemKey]);
    }
  }, [selectedItemKey, pricesByKey, pendingPriceKeys, requestPricesForKeys]);

  // Build modal data from selected item
  const selectedItemModalData = useMemo((): InventoryItemModalData | null => {
    if (!selectedItemKey) return null;
    const rowIndex = keys.indexOf(selectedItemKey);
    if (rowIndex === -1) return null;
    const row = rows[rowIndex];
    if (!row) return null;

    const priceInfo = pricesByKey ? pricesByKey[selectedItemKey] : null;
    const hasPrice =
      typeof priceInfo?.unitPrice === 'number' &&
      Number.isFinite(priceInfo.unitPrice);
    const hasRange =
      typeof priceInfo?.minPrice === 'number' &&
      typeof priceInfo?.maxPrice === 'number' &&
      priceInfo.maxPrice >= priceInfo.minPrice;

    return {
      row,
      pricingSource:
        priceInfo?.pricingSource ?? priceInfo?.pricing_source ?? null,
      bricklinkColorId: priceInfo?.bricklinkColorId ?? null,
      isPricePending: pendingPriceKeys?.has(selectedItemKey) ?? false,
      canRequestPrice: Boolean(
        !pendingPriceKeys?.has(selectedItemKey) &&
          !pricesByKey?.[selectedItemKey] &&
          requestPricesForKeys
      ),
      hasPrice,
      hasRange,
      onRequestPrice: requestPricesForKeys
        ? () => requestPricesForKeys([selectedItemKey])
        : undefined,
    };
  }, [
    selectedItemKey,
    keys,
    rows,
    pricesByKey,
    pendingPriceKeys,
    requestPricesForKeys,
  ]);

  // Render a single inventory item
  const renderInventoryItem = useCallback(
    (rowIndex: number, key: string) => {
      const row = rows[rowIndex]!;
      const priceInfo = pricesByKey ? pricesByKey[key] : null;

      // Compute displayOwned: use derived status for parent minifigs
      const isMinifigParent =
        row.parentCategory === 'Minifigure' &&
        typeof row.partId === 'string' &&
        row.partId.startsWith('fig:');
      const derivedStatus = isMinifigParent
        ? minifigStatusByKey.get(key)
        : null;
      const displayOwned =
        derivedStatus?.state === 'complete'
          ? row.quantityRequired
          : (ownedByKey[key] ?? 0);

      const missingQty = computeMissing(
        row.quantityRequired ?? 0,
        displayOwned
      );

      return (
        <InventoryItem
          key={key}
          setNumber={setNumber}
          row={row}
          owned={displayOwned}
          missing={missingQty}
          bricklinkColorId={priceInfo?.bricklinkColorId ?? null}
          rarityTier={rarityByIndex[rowIndex]}
          onOwnedChange={nextOwned => {
            const clamped = clampOwned(nextOwned, row.quantityRequired ?? 0);
            handleOwnedChange(key, clamped);
          }}
          isPinned={isPinned(key)}
          onTogglePinned={() => togglePinned(key)}
          onShowMoreInfo={() => setSelectedItemKey(key)}
        />
      );
    },
    [
      rows,
      pricesByKey,
      ownedByKey,
      minifigStatusByKey,
      rarityByIndex,
      setNumber,
      handleOwnedChange,
      isPinned,
      togglePinned,
    ]
  );

  // Render items - no wrapper divs needed, spacing handled by container
  const renderedItems = useMemo(() => {
    return sortedIndices.map(rowIndex => {
      const key = keys[rowIndex]!;
      return renderInventoryItem(rowIndex, key);
    });
  }, [sortedIndices, keys, renderInventoryItem]);

  return (
    <div className="flex h-full flex-col">
      {/* Connection Status for Search Party */}
      {isInGroupSession &&
        !sp?.sessionEnded &&
        sp?.hasConnectedOnce &&
        sp?.connectionState !== 'connected' && (
          <div className="flex items-center gap-2 border-b border-subtle bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <span className="animate-pulse">●</span>
            <span>Reconnecting to Search Party...</span>
          </div>
        )}

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
          data-inventory-scroller={scrollerKey}
          data-view={view}
          data-item-size={itemSize}
        >
          {isLoading ? (
            <div className="flex min-h-[60dvh] items-center justify-center">
              <BrickLoader />
            </div>
          ) : (
            <div
              className={
                view === 'list'
                  ? 'flex flex-col gap-2 px-2 pt-4 pb-1'
                  : `grid ${gridSizes} gap-2 px-3 pt-4 pb-1`
              }
              data-view={view}
              data-item-size={itemSize}
            >
              {renderedItems}
            </div>
          )}
        </div>
      )}

      {/* Export Modal */}
      <ExportModal
        open={exportOpen}
        onClose={closeExportModal}
        {...(setName ? { setName } : {})}
        setNumber={setNumber}
        getMissingRows={getMissingRows}
        getAllRows={getAllRows}
      />

      {/* Migration Modal */}
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

      {/* Item Details Modal - single instance for all items */}
      <InventoryItemModal
        open={selectedItemKey !== null}
        onClose={() => setSelectedItemKey(null)}
        data={selectedItemModalData}
      />
    </div>
  );
}
