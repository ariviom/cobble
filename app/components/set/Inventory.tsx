'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { useAuth } from '@/app/components/providers/auth-provider';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Modal } from '@/app/components/ui/Modal';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { useEffect, useMemo, useRef, useState } from 'react';
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

const RARITY_LABELS: Record<string, string> = {
  exclusive: 'Exclusive (1 set)',
  very_rare: 'Very Rare (2–3 sets)',
  rare: 'Rare (4–10 sets)',
  common: 'Common (10+ sets)',
};

function formatGroupLabel(groupKey: string): string {
  // Rarity tiers
  if (groupKey in RARITY_LABELS) return RARITY_LABELS[groupKey]!;
  // Size (stud area) — raw number string from parseStudAreaFromName
  const asNum = Number(groupKey);
  if (!Number.isNaN(asNum) && groupKey.length <= 5) {
    if (asNum < 0) return 'Unknown Size';
    return `${asNum} stud${asNum === 1 ? '' : 's'}`;
  }
  // Color / category — already human-readable
  return groupKey;
}

function MigrationModalContent({
  migration,
  isMigrating,
  totalPieces,
  onPushLocal,
  onKeepCloud,
}: {
  migration: { localTotal: number; supabaseTotal: number } | null;
  isMigrating: boolean;
  totalPieces: number;
  onPushLocal: () => void;
  onKeepCloud: () => void;
}) {
  const local = migration?.localTotal ?? 0;
  const cloud = migration?.supabaseTotal ?? 0;
  const localWins = local > cloud;
  const cloudWins = cloud > local;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Choose whether to keep your cloud data or push your local data.
      </p>
      <div className="flex flex-col gap-2">
        <Button disabled={isMigrating} onClick={onPushLocal}>
          Push local to cloud{' '}
          <span className={localWins ? 'font-bold' : 'opacity-70'}>
            ({local}/{totalPieces})
          </span>
        </Button>
        <Button
          variant="secondary"
          disabled={isMigrating}
          onClick={onKeepCloud}
        >
          Keep cloud data{' '}
          <span className={cloudWins ? 'font-bold' : 'opacity-70'}>
            ({cloud}/{totalPieces})
          </span>
        </Button>
      </div>
    </div>
  );
}

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
  const { user, isLoading: authLoading } = useAuth();
  const isAuthenticated = !!user && !authLoading;
  const {
    view,
    itemSize,
    sortedIndices,
    groupKeyByIndex,
    rarityByIndex,
    gridSizes,
  } = useInventoryControls();
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
      hasPrice,
      hasRange,
      unitPrice: priceInfo?.unitPrice ?? null,
      minPrice: priceInfo?.minPrice ?? null,
      maxPrice: priceInfo?.maxPrice ?? null,
      currency: priceInfo?.currency ?? null,
    };
  }, [
    selectedItemKey,
    keys,
    rows,
    pricesByKey,
    pendingPriceKeys,
    requestPricesForKeys,
  ]);

  // Inline rendering helper — renders items directly in JSX.
  // InventoryItem's memo comparator prevents DOM updates for unchanged items.
  const renderItems = () => {
    const elements: React.ReactNode[] = [];
    let lastGroupKey: string | null = null;

    for (const rowIndex of sortedIndices) {
      // Insert a group header when the group key changes
      if (groupKeyByIndex) {
        const groupKey = groupKeyByIndex[rowIndex] ?? '';
        if (groupKey !== lastGroupKey) {
          lastGroupKey = groupKey;
          elements.push(
            <div
              key={`group-${groupKey}`}
              className="col-span-full flex items-center gap-3 pt-4 first:pt-0"
            >
              <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {formatGroupLabel(groupKey)}
              </span>
              <div className="bg-border h-px flex-1" />
            </div>
          );
        }
      }

      const key = keys[rowIndex]!;
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

      elements.push(
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
          isAuthenticated={isAuthenticated}
          isInGroupSession={isInGroupSession}
        />
      );
    }

    return elements;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
              {renderItems()}
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
        <MigrationModalContent
          migration={migration}
          isMigrating={isMigrating}
          totalPieces={rows.reduce((sum, r) => sum + r.quantityRequired, 0)}
          onPushLocal={confirmMigration}
          onKeepCloud={keepCloudData}
        />
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
