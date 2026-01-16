'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Modal } from '@/app/components/ui/Modal';
import { Spinner } from '@/app/components/ui/Spinner';
import { Toast } from '@/app/components/ui/Toast';
import { useCallback, useMemo, useRef } from 'react';
import { clampOwned, computeMissing } from './inventory-utils';
import { useInventoryContext } from './InventoryProvider';
import { InventoryItem } from './items/InventoryItem';
import { SearchPartyBanner } from './SearchPartyBanner';

export function Inventory() {
  const ctx = useInventoryContext();
  const {
    setNumber,
    setName,
    rows,
    keys,
    ownedByKey,
    minifigStatusByKey,
    isLoading,
    error,
    isMinifigEnriching,
    minifigEnrichmentError,
    retryMinifigEnrichment,
    view,
    itemSize,
    sortedIndices,
    gridSizes,
    pricesByKey,
    pendingPriceKeys,
    requestPricesForKeys,
    handleOwnedChange,
    isPinned,
    togglePinned,
    isInGroupSession,
    connectionState,
    hasConnectedOnce,
    exportOpen,
    closeExportModal,
    getMissingRows,
    getAllRows,
    showEnrichmentToast,
    dismissEnrichmentToast,
    migration,
    isMigrating,
    confirmMigration,
    keepCloudData,
  } = ctx;

  const scrollerRef = useRef<HTMLDivElement | null>(null);

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
            handleOwnedChange(key, clamped);
          }}
          isPinned={isPinned(key)}
          onTogglePinned={() => togglePinned(key)}
          isEnriching={isMinifigEnriching}
        />
      );
    },
    [
      rows,
      pricesByKey,
      ownedByKey,
      minifigStatusByKey,
      setNumber,
      pendingPriceKeys,
      requestPricesForKeys,
      handleOwnedChange,
      isPinned,
      togglePinned,
      isMinifigEnriching,
    ]
  );

  // Pre-render list rows
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

  // Pre-render grid rows
  const gridRows = useMemo(() => {
    if (view !== 'grid') return null;
    return sortedIndices.map(rowIndex => {
      const key = keys[rowIndex]!;
      return (
        <div
          key={key}
          className="h-full"
          data-view="grid"
          data-item-size={itemSize}
        >
          {renderInventoryItem(rowIndex, key)}
        </div>
      );
    });
  }, [view, sortedIndices, keys, itemSize, renderInventoryItem]);

  return (
    <div className="flex h-full flex-col">
      {/* Search Party Experimental Banner */}
      {isInGroupSession && <SearchPartyBanner />}

      {/* Connection Status for Search Party */}
      {isInGroupSession &&
        hasConnectedOnce &&
        connectionState !== 'connected' && (
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

      {/* Enrichment toasts */}
      <div className="flex items-center gap-3">
        {showEnrichmentToast &&
        isMinifigEnriching &&
        !minifigEnrichmentError ? (
          <Toast
            title="Enriching minifigs…"
            description="Fetching images and subparts."
            variant="info"
            onClose={dismissEnrichmentToast}
          />
        ) : null}
        {showEnrichmentToast && minifigEnrichmentError ? (
          <Toast
            title="Minifig enrichment failed"
            description="Some minifigure images could not be loaded."
            variant="warning"
            {...(retryMinifigEnrichment
              ? { actionLabel: 'Retry', onAction: retryMinifigEnrichment }
              : {})}
            onClose={dismissEnrichmentToast}
          />
        ) : null}
      </div>

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
    </div>
  );
}
