'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { Button } from '@/app/components/ui/Button';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Modal } from '@/app/components/ui/Modal';
import { Spinner } from '@/app/components/ui/Spinner';
import { Toast } from '@/app/components/ui/Toast';
import { useGroupSessionChannel } from '@/app/hooks/useGroupSessionChannel';
import { useInventoryPrices } from '@/app/hooks/useInventoryPrices';
import { useInventoryViewModel } from '@/app/hooks/useInventoryViewModel';
import { useSupabaseOwned } from '@/app/hooks/useSupabaseOwned';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampOwned, computeMissing } from './inventory-utils';
import { InventoryControls } from './InventoryControls';
import { InventoryItem } from './items/InventoryItem';
import type {
  InventoryFilter,
  InventoryRow,
  ItemSize,
  MinifigSubpartStatus,
  SortKey,
  ViewType,
} from './types';

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
  initialInventory?: InventoryRow[] | null;
  /**
   * When false, Supabase-backed owned sync is disabled and changes remain
   * local. Used for Search Party participants so only the host persists
   * owned quantities to user_set_parts.
   */
  enableCloudSync?: boolean;
  /**
   * Optional Search Party session metadata. When provided, owned changes
   * will be broadcast to other participants via Supabase Realtime and
   * incoming updates from others will be applied locally.
   */
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

export function InventoryTable({
  setNumber,
  setName,
  initialInventory,
  enableCloudSync = true,
  groupSessionId,
  groupParticipantId,
  groupClientId,
  onParticipantPiecesDelta,
  onPriceStatusChange,
  onPriceTotalsChange,
}: InventoryTableProps) {
  const {
    rows,
    isLoading,
    error,
    keys,
    ownedByKey,
    isOwnedHydrated,
    isStorageAvailable,
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
    groupKeyByIndex,
    gridSizes,
    subcategoriesByParent,
    colorOptions,
    countsByParent,
    parentOptions,
    computeMissingRows,
  } = useInventoryViewModel(setNumber, {
    initialRows: initialInventory ?? null,
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [showEnrichmentToast, setShowEnrichmentToast] = useState(false);
  const clearAllOwned = useOwnedStore(state => state.clearAll);

  type PriceInfo = {
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

  const { pricesByKey, pendingKeys, requestPricesForKeys } =
    useInventoryPrices<PriceInfo>({
      setNumber,
      rows,
      keys,
      ...(onPriceStatusChange ? { onPriceStatusChange } : {}),
      ...(onPriceTotalsChange ? { onPriceTotalsChange } : {}),
    });

  const pinnedStore = usePinnedStore();

  const {
    handleOwnedChange,
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

  const { broadcastPieceDelta, broadcastOwnedSnapshot } =
    useGroupSessionChannel({
      enabled:
        Boolean(groupSessionId) &&
        Boolean(groupParticipantId) &&
        Boolean(groupClientId),
      sessionId: groupSessionId ?? null,
      setNumber,
      participantId: groupParticipantId ?? null,
      clientId: groupClientId ?? '',
      onRemoteDelta: payload => {
        handleOwnedChange(payload.key, payload.newOwned);
      },
      onRemoteSnapshot: snapshot => {
        if (!snapshot || typeof snapshot !== 'object') return;
        Object.entries(snapshot).forEach(([key, value]) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) return;
          handleOwnedChange(key, value);
        });
      },
      ...(onParticipantPiecesDelta ? { onParticipantPiecesDelta } : {}),
    });
  const hasBroadcastSnapshotRef = useRef(false);
  const hasClearedLocalForJoinerRef = useRef(false);

  // For joiners (participants with cloud sync disabled), clear any stale local
  // owned data once so the host snapshot can be authoritative.
  useEffect(() => {
    if (enableCloudSync) return;
    if (!groupSessionId || !groupParticipantId || !groupClientId) return;
    if (hasClearedLocalForJoinerRef.current) return;
    clearAllOwned(setNumber);
    hasClearedLocalForJoinerRef.current = true;
  }, [
    enableCloudSync,
    groupSessionId,
    groupParticipantId,
    groupClientId,
    clearAllOwned,
    setNumber,
  ]);

  // Send initial owned snapshot for hosts (enableCloudSync) after hydration.
  useEffect(() => {
    if (
      !enableCloudSync ||
      !groupSessionId ||
      !groupParticipantId ||
      !groupClientId
    ) {
      return;
    }
    if (!isOwnedHydrated) return;
    if (hasBroadcastSnapshotRef.current) return;

    broadcastOwnedSnapshot(ownedByKey);
    hasBroadcastSnapshotRef.current = true;
  }, [
    enableCloudSync,
    groupSessionId,
    groupParticipantId,
    groupClientId,
    isOwnedHydrated,
    ownedByKey,
    broadcastOwnedSnapshot,
  ]);

  const rowByKey = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    for (let i = 0; i < rows.length; i += 1) {
      const k = keys[i];
      if (!k) continue;
      map.set(k, rows[i]!);
    }
    return map;
  }, [rows, keys]);

  const minifigStatusByKey = useMemo(() => {
    const result = new Map<string, MinifigSubpartStatus>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const key = keys[i]!;
      const isFigId =
        typeof row.partId === 'string' && row.partId.startsWith('fig:');
      const isMinifigParent = row.parentCategory === 'Minifigure' && isFigId;

      if (!isMinifigParent) continue;

      const relations = Array.isArray(row.componentRelations)
        ? row.componentRelations
        : [];

      if (relations.length === 0) {
        result.set(key, {
          state: 'unknown',
          missingCount: 0,
          sharedShortageCount: 0,
        });
        continue;
      }

      let missingCount = 0;
      let sharedShortageCount = 0;

      for (const rel of relations) {
        const childKey = rel.key;
        const requiredForFig = rel.quantity;
        const childRow = rowByKey.get(childKey);
        const ownedChild = ownedByKey[childKey] ?? 0;

        if (!childRow) {
          missingCount += requiredForFig;
          continue;
        }

        const totalParentDemand =
          childRow.parentRelations?.reduce(
            (sum, parentRel) => sum + parentRel.quantity,
            0
          ) ?? requiredForFig;

        if (ownedChild < requiredForFig) {
          missingCount += requiredForFig - ownedChild;
        }

        const isShared =
          (childRow.parentRelations?.length ?? 0) > 1 ||
          totalParentDemand > requiredForFig;

        if (isShared && ownedChild < totalParentDemand) {
          sharedShortageCount += 1;
        }
      }

      if (missingCount > 0) {
        result.set(key, {
          state: 'missing',
          missingCount,
          sharedShortageCount,
        });
        continue;
      }

      if (sharedShortageCount > 0) {
        result.set(key, {
          state: 'shared_shortfall',
          missingCount: 0,
          sharedShortageCount,
        });
        continue;
      }

      result.set(key, {
        state: 'complete',
        missingCount: 0,
        sharedShortageCount: 0,
      });
    }

    return result;
  }, [rows, keys, ownedByKey, rowByKey]);

  useEffect(() => {
    if (minifigEnrichmentError) {
      setShowEnrichmentToast(true);
    } else {
      setShowEnrichmentToast(false);
    }
  }, [minifigEnrichmentError]);

  const handleRetryEnrichment = useCallback(async () => {
    setShowEnrichmentToast(false);
    await retryMinifigEnrichment();
  }, [retryMinifigEnrichment]);

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

  // Show loading state while owned data is hydrating from IndexedDB
  const isHydrating = !isOwnedHydrated && !isLoading;

  const VIRTUALIZE_THRESHOLD = 500;
  const listParentRef = useRef<HTMLDivElement | null>(null);
  const shouldVirtualizeList =
    view === 'list' &&
    groupBy === 'none' &&
    effectiveSortedIndices.length > VIRTUALIZE_THRESHOLD;
  const estimateItemSize = useMemo(() => {
    switch (itemSize) {
      case 'sm':
        return 140;
      case 'md':
        return 180;
      case 'lg':
      default:
        return 230;
    }
  }, [itemSize]);

  const virtualizer = useVirtualizer({
    count: shouldVirtualizeList ? effectiveSortedIndices.length : 0,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => estimateItemSize,
    overscan: 12,
  });

  const renderInventoryItem = (originalIndex: number) => {
    const r = rows[originalIndex]!;
    const key = keys[originalIndex]!;
    const owned = ownedByKey[key] ?? 0;
    const derivedStatus = minifigStatusByKey.get(key);
    const displayOwned =
      derivedStatus?.state === 'complete' ? r.quantityRequired : owned;
    const missing = computeMissing(r.quantityRequired, displayOwned);
    const priceInfo = pricesByKey[key];

    return (
      <InventoryItem
        key={key}
        setNumber={setNumber}
        row={r}
        owned={displayOwned}
        missing={missing}
        unitPrice={priceInfo?.unitPrice ?? null}
        minPrice={priceInfo?.minPrice ?? null}
        maxPrice={priceInfo?.maxPrice ?? null}
        currency={priceInfo?.currency ?? null}
        pricingSource={
          priceInfo?.pricingSource ?? priceInfo?.pricing_source ?? null
        }
        pricingScopeLabel={priceInfo?.scopeLabel ?? null}
        bricklinkColorId={priceInfo?.bricklinkColorId ?? null}
        isPricePending={pendingKeys.has(key)}
        canRequestPrice={!pendingKeys.has(key) && !pricesByKey[key]}
        isEnriching={isMinifigEnriching}
        onRequestPrice={() => {
          void requestPricesForKeys([key]);
        }}
        onOwnedChange={next => {
          const clamped = clampOwned(next, r.quantityRequired);
          const prevOwned = ownedByKey[key] ?? 0;
          const delta = clamped - prevOwned;

          handleOwnedChange(key, clamped);

          if (
            delta !== 0 &&
            groupSessionId &&
            groupParticipantId &&
            groupClientId
          ) {
            broadcastPieceDelta({
              key,
              delta,
              newOwned: clamped,
            });
          }

          // When a whole minifigure row changes, propagate the delta
          // to its component rows (subparts).
          const isFigId =
            typeof r.partId === 'string' && r.partId.startsWith('fig:');
          const isMinifigParent = r.parentCategory === 'Minifigure' && isFigId;

          if (
            delta !== 0 &&
            isMinifigParent &&
            Array.isArray(r.componentRelations)
          ) {
            for (const rel of r.componentRelations) {
              const childKey = rel.key;
              const childRow = rowByKey.get(childKey);
              if (!childRow) continue;
              const childOwned = ownedByKey[childKey] ?? 0;
              const nextChildOwned = clampOwned(
                childOwned + delta * rel.quantity,
                childRow.quantityRequired
              );
              const childDelta = nextChildOwned - childOwned;

              handleOwnedChange(childKey, nextChildOwned);

              if (
                childDelta !== 0 &&
                groupSessionId &&
                groupParticipantId &&
                groupClientId
              ) {
                broadcastPieceDelta({
                  key: childKey,
                  delta: childDelta,
                  newOwned: nextChildOwned,
                });
              }
            }
          }

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
  };

  // Do not early-return to preserve hooks order
  return (
    <div className="pb-2 lg:grid lg:h-full lg:grid-rows-[var(--spacing-controls-height)_minmax(0,1fr)]">
      {showEnrichmentToast && minifigEnrichmentError ? (
        <Toast
          title="Minifig enrichment issue"
          description={minifigEnrichmentError}
          variant="warning"
          actionLabel="Retry"
          onAction={handleRetryEnrichment}
          onClose={() => setShowEnrichmentToast(false)}
          mobileBottomOffset="calc(var(--nav-height, 64px) + 16px)"
        />
      ) : null}
      {/* Storage unavailable warning */}
      {!isStorageAvailable && (
        <div className="mx-4 mb-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          <span className="font-medium">Local storage unavailable.</span> Your
          progress will be lost when you close this tab.
        </div>
      )}
      {migration?.open && (
        <Modal
          open={migration.open}
          onClose={() => {
            void keepCloudData();
          }}
          title="Sync owned pieces for this set?"
        >
          <div className="flex flex-col gap-3 text-sm">
            <p>
              We found owned-piece data for this set saved on this device that
              differs from what&apos;s stored in your account.
            </p>
            <p className="text-xs text-foreground-muted">
              This device:{' '}
              <span className="font-semibold">
                {migration.localTotal.toLocaleString()}
              </span>{' '}
              pieces
              <br />
              Cloud:{' '}
              <span className="font-semibold">
                {migration.supabaseTotal.toLocaleString()}
              </span>{' '}
              pieces
            </p>
            <p className="text-xs text-foreground-muted">
              Choose whether to keep the cloud version or replace it with the
              data on this device for this set.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  void keepCloudData();
                }}
              >
                Keep cloud data
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isMigrating}
                onClick={() => {
                  void confirmMigration();
                }}
              >
                {isMigrating ? 'Syncing…' : 'Use this device data'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
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
        onOpenExportModal={() => setExportOpen(true)}
      />

      <div className="bg-background pt-inventory-offset transition-[padding] lg:overflow-y-auto lg:pt-0">
        <div className="flex flex-col p-2">
          {error ? (
            <ErrorBanner message="Failed to load inventory. Please try again." />
          ) : isLoading || isHydrating ? (
            <Spinner
              className="p-4"
              label={
                isHydrating ? 'Loading your progress…' : 'Loading inventory…'
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState message="No inventory found." />
          ) : groupBy === 'none' ? (
            view === 'grid' ? (
              <div
                data-view={view}
                data-item-size={itemSize}
                className={`grid gap-2 ${gridSizes}`}
              >
                {effectiveSortedIndices.map(originalIndex => (
                  <div key={keys[originalIndex]!} className="w-full">
                    {renderInventoryItem(originalIndex)}
                  </div>
                ))}
              </div>
            ) : shouldVirtualizeList ? (
              <div
                ref={listParentRef}
                className="relative w-full overflow-auto"
                style={{ minHeight: '400px', maxHeight: 'calc(100vh - 220px)' }}
              >
                <div
                  style={{
                    height: virtualizer.getTotalSize(),
                    position: 'relative',
                    width: '100%',
                  }}
                >
                  {virtualizer.getVirtualItems().map(virtualRow => {
                    const originalIndex =
                      effectiveSortedIndices[virtualRow.index]!;
                    const key = keys[originalIndex]!;
                    return (
                      <div
                        key={key}
                        className="absolute right-0 left-0 p-1"
                        style={{
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {renderInventoryItem(originalIndex)}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {effectiveSortedIndices.map(originalIndex => (
                  <div key={keys[originalIndex]!} className="w-full">
                    {renderInventoryItem(originalIndex)}
                  </div>
                ))}
              </div>
            )
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
                    <div className="sticky top-sticky-label z-10 bg-background px-1 py-2 text-sm font-semibold text-foreground lg:top-0">
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
                        const derivedStatus = minifigStatusByKey.get(key);
                        const displayOwned =
                          derivedStatus?.state === 'complete'
                            ? r.quantityRequired
                            : owned;
                        const missing = computeMissing(
                          r.quantityRequired,
                          displayOwned
                        );
                        const priceInfo = pricesByKey[key];
                        return (
                          <InventoryItem
                            key={key}
                            setNumber={setNumber}
                            row={r}
                            owned={displayOwned}
                            missing={missing}
                            unitPrice={priceInfo?.unitPrice ?? null}
                            minPrice={priceInfo?.minPrice ?? null}
                            maxPrice={priceInfo?.maxPrice ?? null}
                            currency={priceInfo?.currency ?? null}
                            pricingScopeLabel={priceInfo?.scopeLabel ?? null}
                            bricklinkColorId={
                              priceInfo?.bricklinkColorId ?? null
                            }
                            isPricePending={pendingKeys.has(key)}
                            canRequestPrice={
                              !pendingKeys.has(key) && !pricesByKey[key]
                            }
                            onRequestPrice={() => {
                              void requestPricesForKeys([key]);
                            }}
                            onOwnedChange={next => {
                              const clamped = clampOwned(
                                next,
                                r.quantityRequired
                              );
                              const prevOwned = ownedByKey[key] ?? 0;
                              const delta = clamped - prevOwned;

                              handleOwnedChange(key, clamped);

                              if (
                                delta !== 0 &&
                                groupSessionId &&
                                groupParticipantId &&
                                groupClientId
                              ) {
                                broadcastPieceDelta({
                                  key,
                                  delta,
                                  newOwned: clamped,
                                });
                              }

                              const isFigId =
                                typeof r.partId === 'string' &&
                                r.partId.startsWith('fig:');
                              const isMinifigParent =
                                r.parentCategory === 'Minifigure' && isFigId;

                              if (
                                delta !== 0 &&
                                isMinifigParent &&
                                Array.isArray(r.componentRelations)
                              ) {
                                for (const rel of r.componentRelations) {
                                  const childKey = rel.key;
                                  const childRow = rowByKey.get(childKey);
                                  if (!childRow) continue;
                                  const childOwned = ownedByKey[childKey] ?? 0;
                                  const nextChildOwned = clampOwned(
                                    childOwned + delta * rel.quantity,
                                    childRow.quantityRequired
                                  );
                                  const childDelta =
                                    nextChildOwned - childOwned;

                                  handleOwnedChange(childKey, nextChildOwned);

                                  if (
                                    childDelta !== 0 &&
                                    groupSessionId &&
                                    groupParticipantId &&
                                    groupClientId
                                  ) {
                                    broadcastPieceDelta({
                                      key: childKey,
                                      delta: childDelta,
                                      newOwned: nextChildOwned,
                                    });
                                  }
                                }
                              }

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
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        setNumber={setNumber}
        {...(setName ? { setName } : {})}
        getMissingRows={computeMissingRows}
      />
    </div>
  );
}
