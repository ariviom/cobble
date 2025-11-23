'use client';

import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Spinner } from '@/app/components/ui/Spinner';
import { useInventoryPrices } from '@/app/hooks/useInventoryPrices';
import { useInventoryViewModel } from '@/app/hooks/useInventoryViewModel';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { useEffect, useMemo } from 'react';
import { clampOwned, computeMissing } from './inventory-utils';
import { InventoryControls } from './InventoryControls';
import { InventoryItem } from './items/InventoryItem';
import type { InventoryFilter, ItemSize, SortKey, ViewType } from './types';

type PriceSummary = {
  total: number;
  minTotal: number | null;
  maxTotal: number | null;
  currency: string | null;
  pricedItemCount: number;
};

type InventoryTableProps = {
  setNumber: string;
  setName?: string;
  pricesEnabled?: boolean;
  onPriceStatusChange?: (
    status: 'idle' | 'loading' | 'loaded' | 'error'
  ) => void;
  onPriceTotalsChange?: (summary: PriceSummary | null) => void;
  onRequestPrices?: () => void;
};

export function InventoryTable({
  setNumber,
  setName,
  pricesEnabled = false,
  onPriceStatusChange,
  onPriceTotalsChange,
  onRequestPrices,
}: InventoryTableProps) {
  const {
    rows,
    isLoading,
    error,
    keys,
    ownedByKey,
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
    groupKeyByIndex,
    gridSizes,
    subcategoriesByParent,
    colorOptions,
    countsByParent,
    parentOptions,
  } = useInventoryViewModel(setNumber);

  type PriceInfo = {
    unitPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    currency: string | null;
    bricklinkColorId: number | null;
    itemType: 'PART' | 'MINIFIG';
  };

  const { pricesByKey, pricesStatus } = useInventoryPrices<PriceInfo>({
    setNumber,
    rows,
    keys,
    sortKey,
    enabled: pricesEnabled,
    ...(onPriceStatusChange ? { onPriceStatusChange } : {}),
    ...(onPriceTotalsChange ? { onPriceTotalsChange } : {}),
  });

  const ownedStore = useOwnedStore();
  const pinnedStore = usePinnedStore();

  const effectiveSortedIndices = useMemo(() => {
    if (sortKey !== 'price') return sortedIndices;

    const idxs = [...sortedIndices];

    idxs.sort((a, b) => {
      const keyA = keys[a]!;
      const keyB = keys[b]!;
      const paRaw = pricesByKey[keyA]?.unitPrice;
      const pbRaw = pricesByKey[keyB]?.unitPrice;
      const hasA = typeof paRaw === 'number' && Number.isFinite(paRaw);
      const hasB = typeof pbRaw === 'number' && Number.isFinite(pbRaw);

      // Always push rows with no price data to the bottom, regardless of sortDir
      if (!hasA && !hasB) return 0;
      if (!hasA) return 1;
      if (!hasB) return -1;

      const pa = paRaw as number;
      const pb = pbRaw as number;
      const diff = pa - pb;
      if (diff === 0) {
        const ra = rows[a]!;
        const rb = rows[b]!;
        const nameCmp = ra.partName.localeCompare(rb.partName);
        if (nameCmp !== 0) return nameCmp;
        return 0;
      }
      return sortDir === 'asc' ? diff : -diff;
    });

    return idxs;
  }, [sortedIndices, sortKey, sortDir, keys, pricesByKey, rows]);

  useEffect(() => {
    // warm localStorage read
    for (const k of keys) {
      ownedStore.getOwned(setNumber, k);
    }
  }, [setNumber, keys, ownedStore]);

  // Do not early-return to preserve hooks order
  return (
    <div className="pb-2 lg:grid lg:h-full lg:grid-rows-[var(--spacing-controls-height)_minmax(0,1fr)]">
      <InventoryControls
        setNumber={setNumber}
        {...(setName ? { setName } : {})}
        view={view}
        onChangeView={(v: ViewType) => setView(v)}
        itemSize={itemSize}
        onChangeItemSize={(s: ItemSize) => setItemSize(s)}
        sortKey={sortKey}
        onChangeSortKey={(k: SortKey) => setSortKey(k)}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
        groupBy={groupBy}
        onChangeGroupBy={setGroupBy}
        filter={filter}
        onChangeFilter={(f: InventoryFilter) => setFilter(f)}
        parentOptions={parentOptions}
        {...(countsByParent ? { parentCounts: countsByParent } : {})}
        subcategoriesByParent={subcategoriesByParent}
        colorOptions={colorOptions}
        onToggleColor={color => {
          const exists = (filter.colors || []).includes(color);
          setFilter({
            ...filter,
            colors: exists
              ? (filter.colors || []).filter(c => c !== color)
              : [...(filter.colors || []), color],
          });
        }}
      />

      <div className="bg-neutral-50 pt-inventory-offset transition-[padding] lg:overflow-y-auto lg:pt-0">
        <div className="flex flex-col p-2">
          {error ? (
            <ErrorBanner message="Failed to load inventory. Please try again." />
          ) : rows.length === 0 || isLoading ? (
            isLoading ? (
              <Spinner className="p-4" label="Loading inventory…" />
            ) : (
              <EmptyState message="No inventory found." />
            )
          ) : groupBy === 'none' ? (
            <div
              data-view={view}
              data-item-size={itemSize}
              className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
            >
              {effectiveSortedIndices.map(originalIndex => {
                const r = rows[originalIndex]!;
                const key = keys[originalIndex]!;
                const owned = ownedByKey[key] ?? 0;
                const missing = computeMissing(r.quantityRequired, owned);
                const priceInfo = pricesByKey[key];
                return (
                  <InventoryItem
                    key={key}
                    row={r}
                    owned={owned}
                    missing={missing}
                    unitPrice={priceInfo?.unitPrice ?? null}
                    minPrice={priceInfo?.minPrice ?? null}
                    maxPrice={priceInfo?.maxPrice ?? null}
                    currency={priceInfo?.currency ?? null}
                    bricklinkColorId={priceInfo?.bricklinkColorId ?? null}
                    isPricePending={pricesStatus === 'loading'}
                    canRequestPrice={!pricesEnabled && pricesStatus === 'idle'}
                    {...(onRequestPrices ? { onRequestPrice: onRequestPrices } : {})}
                    onOwnedChange={next => {
                      const clamped = clampOwned(next, r.quantityRequired);
                      ownedStore.setOwned(setNumber, key, clamped);
                      if (
                        pinnedStore.autoUnpin &&
                        pinnedStore.isPinned(setNumber, key) &&
                        computeMissing(r.quantityRequired, clamped) === 0
                      ) {
                        pinnedStore.setPinned(setNumber, key, false);
                      }
                    }}
                    isPinned={pinnedStore.isPinned(setNumber, key)}
                    onTogglePinned={() =>
                      pinnedStore.togglePinned({
                        setNumber,
                        key,
                        ...(setName ? { setName } : {}),
                      })
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {(() => {
                const grouped = new Map<string, number[]>();
                for (const idx of effectiveSortedIndices) {
                  const k = groupKeyByIndex?.[idx] ?? '';
                  if (!grouped.has(k)) grouped.set(k, []);
                  grouped.get(k)!.push(idx);
                }
                const sections: Array<{ key: string; indices: number[] }> = [];
                for (const [k, v] of grouped.entries())
                  sections.push({ key: k, indices: v });
                sections.sort((a, b) => a.key.localeCompare(b.key));
                return sections.map(sec => (
                  <div key={sec.key} className="flex flex-col gap-2">
                    <div className="sticky top-sticky-label z-10 bg-background/90 px-1 py-2 text-sm font-semibold text-foreground lg:top-0">
                      {sec.key === 'Minifig' ? 'Minifigures' : sec.key}
                    </div>
                    <div
                      data-view={view}
                      data-item-size={itemSize}
                      className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
                    >
                      {sec.indices.map(originalIndex => {
                        const r = rows[originalIndex]!;
                        const key = keys[originalIndex]!;
                        const owned = ownedByKey[key] ?? 0;
                        const missing = computeMissing(
                          r.quantityRequired,
                          owned
                        );
                        const priceInfo = pricesByKey[key];
                        return (
                          <InventoryItem
                            key={key}
                            row={r}
                            owned={owned}
                            missing={missing}
                            unitPrice={priceInfo?.unitPrice ?? null}
                            minPrice={priceInfo?.minPrice ?? null}
                            maxPrice={priceInfo?.maxPrice ?? null}
                            currency={priceInfo?.currency ?? null}
                            bricklinkColorId={
                              priceInfo?.bricklinkColorId ?? null
                            }
                            isPricePending={pricesStatus === 'loading'}
                            canRequestPrice={
                              !pricesEnabled && pricesStatus === 'idle'
                            }
                            {...(onRequestPrices
                              ? { onRequestPrice: onRequestPrices }
                              : {})}
                            onOwnedChange={next => {
                              const clamped = clampOwned(
                                next,
                                r.quantityRequired
                              );
                              ownedStore.setOwned(setNumber, key, clamped);
                              if (
                                pinnedStore.autoUnpin &&
                                pinnedStore.isPinned(setNumber, key) &&
                                computeMissing(r.quantityRequired, clamped) ===
                                  0
                              ) {
                                pinnedStore.setPinned(setNumber, key, false);
                              }
                            }}
                            isPinned={pinnedStore.isPinned(setNumber, key)}
                            onTogglePinned={() =>
                              pinnedStore.togglePinned({
                                setNumber,
                                key,
                                ...(setName ? { setName } : {}),
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
