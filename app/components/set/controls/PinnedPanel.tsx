'use client';

import { InventoryItem } from '@/app/components/set/items/InventoryItem';
import {
  InventoryItemModal,
  type InventoryItemModalData,
} from '@/app/components/set/items/InventoryItemModal';
import { Checkbox } from '@/app/components/ui/Checkbox';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { useInventoryContext } from '@/app/components/set/InventoryProvider';
import { useInventory } from '@/app/hooks/useInventory';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { useCallback, useState } from 'react';
import { clampOwned, computeMissing } from '../inventory-utils';
import type { InventoryRow, ItemSize, ViewType } from '../types';

type PinnedPanelContentProps = {
  currentSetNumber: string;
  currentSetName: string | undefined;
  view: ViewType;
  itemSize: ItemSize;
};

export function PinnedPanelContent({
  currentSetNumber,
  currentSetName,
  view,
  itemSize,
}: PinnedPanelContentProps) {
  const { handleOwnedChange: contextOwnedChange } = useInventoryContext();
  const pinnedState = usePinnedStore();
  const { getPinnedKeysForSet, getPinnedSets, autoUnpin, showOtherSets } =
    pinnedState;

  const currentSetKeys = getPinnedKeysForSet(currentSetNumber);
  const allPinnedSets = getPinnedSets();
  const otherSetNumbers = showOtherSets
    ? allPinnedSets.filter(setNum => setNum !== currentSetNumber)
    : [];

  const hasAnyPins = currentSetKeys.length > 0 || otherSetNumbers.length > 0;

  const gridSizes =
    itemSize === 'sm'
      ? 'grid-cols-2 xs:grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'
      : itemSize === 'md'
        ? 'grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
        : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6';

  // Modal state for item details
  const [selectedItem, setSelectedItem] = useState<{
    row: InventoryRow;
    setNumber: string;
  } | null>(null);

  const handleShowMoreInfo = useCallback(
    (row: InventoryRow, setNumber: string) => {
      setSelectedItem({ row, setNumber });
    },
    []
  );

  const selectedItemModalData: InventoryItemModalData | null = selectedItem
    ? { row: selectedItem.row }
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {!hasAnyPins ? (
          <div className="flex h-64 w-full items-center justify-center p-4 text-sm text-foreground-muted">
            No pinned pieces yet. Use the pin icon on any piece to add it here.
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-3">
            {currentSetKeys.length > 0 && (
              <PinnedSetSection
                setNumber={currentSetNumber}
                {...(currentSetName ? { setName: currentSetName } : {})}
                pinnedKeys={currentSetKeys}
                view={view}
                itemSize={itemSize}
                gridSizes={gridSizes}
                isCurrent
                onOwnedChange={contextOwnedChange}
                onShowMoreInfo={handleShowMoreInfo}
              />
            )}

            {otherSetNumbers.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-1 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
                  <span className="bg-border h-px flex-1" />
                  <span>Pinned from other sets</span>
                  <span className="bg-border h-px flex-1" />
                </div>
                {otherSetNumbers.map(setNum => (
                  <PinnedSetSection
                    key={setNum}
                    setNumber={setNum}
                    pinnedKeys={getPinnedKeysForSet(setNum)}
                    view={view}
                    itemSize={itemSize}
                    gridSizes={gridSizes}
                    onShowMoreInfo={handleShowMoreInfo}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-subtle text-sm">
        <div className="flex flex-col">
          <label className="flex cursor-pointer items-center gap-4 px-3 py-4 hover:bg-card">
            <Checkbox
              className="size-5"
              checked={autoUnpin}
              onChange={e => pinnedState.setAutoUnpin(e.currentTarget.checked)}
            />
            <span>Automatically unpin completed pieces</span>
          </label>
          <label className="flex cursor-pointer items-center gap-4 border-t border-subtle px-3 py-4 hover:bg-card">
            <Checkbox
              className="size-5"
              checked={showOtherSets}
              onChange={e =>
                pinnedState.setShowOtherSets(e.currentTarget.checked)
              }
            />
            <span>Show pinned pieces from other sets</span>
          </label>
        </div>
      </div>

      {/* Item Details Modal - single instance for all pinned items */}
      <InventoryItemModal
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        data={selectedItemModalData}
      />
    </div>
  );
}

type PinnedSetSectionProps = {
  setNumber: string;
  setName?: string;
  pinnedKeys: string[];
  view: ViewType;
  itemSize: ItemSize;
  gridSizes: string;
  isCurrent?: boolean;
  /** Context-aware owned change handler (enables cascade, sync, broadcast) */
  onOwnedChange?: (key: string, nextOwned: number) => void;
  onShowMoreInfo?: (row: InventoryRow, setNumber: string) => void;
};

function PinnedSetSection({
  setNumber,
  setName,
  pinnedKeys,
  view,
  itemSize,
  gridSizes,
  isCurrent,
  onOwnedChange,
  onShowMoreInfo,
}: PinnedSetSectionProps) {
  const { rows, keys, isLoading, error, ownedByKey } = useInventory(setNumber);
  const ownedStore = useOwnedStore();
  const pinnedState = usePinnedStore();

  const [visibleCount, setVisibleCount] = useState(24);

  const title = (() => {
    const meta = pinnedState.getMetaForSet(setNumber);
    const nameFromMeta = meta?.setName ?? setName;
    if (nameFromMeta && nameFromMeta.length > 0) {
      return `${setNumber} — ${nameFromMeta}`;
    }
    return setNumber;
  })();

  if (pinnedKeys.length === 0) return null;

  if (isLoading && rows.length === 0) {
    return (
      <BrickLoader
        className="rounded border border-subtle bg-card p-3 text-sm text-foreground-muted"
        label={`Loading pinned pieces for ${title}…`}
      />
    );
  }

  if (error) {
    return (
      <ErrorBanner
        className="p-3 text-sm"
        message={`Failed to load pinned pieces for ${title}.`}
      />
    );
  }

  if (rows.length === 0) return null;

  const keyToIndex = new Map<string, number>();
  keys.forEach((k: string, idx: number) => {
    keyToIndex.set(k, idx);
  });

  const pinnedItems: Array<{ key: string; row: InventoryRow }> = [];
  for (const key of pinnedKeys) {
    const idx = keyToIndex.get(key);
    if (idx == null) continue;
    const row = rows[idx];
    if (!row) continue;
    pinnedItems.push({ key, row });
  }

  if (pinnedItems.length === 0) return null;

  const limitedItems = pinnedItems.slice(0, visibleCount);

  return (
    <section className="flex flex-col gap-2">
      <div className="px-1 py-1 text-sm font-semibold text-foreground">
        {title}
        {isCurrent ? ' (current set)' : null}
      </div>
      <div
        data-view={view}
        data-item-size={itemSize}
        className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
      >
        {limitedItems.map(({ key, row }) => {
          const owned = ownedByKey[key] ?? 0;
          const missing = computeMissing(row.quantityRequired, owned);
          return (
            <InventoryItem
              key={key}
              setNumber={setNumber}
              row={row}
              owned={owned}
              missing={missing}
              onOwnedChange={next => {
                const clamped = clampOwned(next, row.quantityRequired);
                if (onOwnedChange) {
                  onOwnedChange(key, clamped);
                } else {
                  ownedStore.setOwned(setNumber, key, clamped);
                }
                if (
                  pinnedState.autoUnpin &&
                  pinnedState.isPinned(setNumber, key) &&
                  computeMissing(row.quantityRequired, clamped) === 0
                ) {
                  pinnedState.setPinned(setNumber, key, false);
                }
              }}
              isPinned={pinnedState.isPinned(setNumber, key)}
              onTogglePinned={() =>
                pinnedState.togglePinned({
                  setNumber,
                  key,
                  ...(setName ? { setName } : {}),
                })
              }
              {...(onShowMoreInfo
                ? { onShowMoreInfo: () => onShowMoreInfo(row, setNumber) }
                : {})}
            />
          );
        })}
      </div>
      {pinnedItems.length > visibleCount && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            className="rounded border border-subtle bg-card px-3 py-1 text-xs hover:bg-card-muted"
            onClick={() =>
              setVisibleCount(current =>
                Math.min(current + 24, pinnedItems.length)
              )
            }
          >
            Load more pieces
          </button>
        </div>
      )}
    </section>
  );
}
