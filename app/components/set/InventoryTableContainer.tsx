'use client';

import { useGroupSessionChannel } from '@/app/hooks/useGroupSessionChannel';
import { useInventoryPrices } from '@/app/hooks/useInventoryPrices';
import { useInventoryViewModel } from '@/app/hooks/useInventoryViewModel';
import { useSupabaseOwned } from '@/app/hooks/useSupabaseOwned';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InventoryTableView, type PriceInfo } from './InventoryTableView';
import type { InventoryRow } from './types';

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
    minifigStatusByKey,
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
    sortedIndices,
    subcategoriesByParent,
    colorOptions,
    countsByParent,
    parentOptions,
    gridSizes,
  } = useInventoryViewModel(setNumber, {
    initialRows: initialInventory ?? null,
  });

  const [exportOpen, setExportOpen] = useState(false);
  const clearAllOwned = useOwnedStore(state => state.clearAll);

  // Enrichment toast: derive visibility from state instead of syncing via useEffect
  // Track if user has manually dismissed the toast for the current enrichment cycle
  const [toastDismissedForCycle, setToastDismissedForCycle] = useState(false);

  // Reset dismissal when a new enrichment cycle starts (React-recommended pattern
  // for adjusting state based on prop changes - see react.dev/learn/you-might-not-need-an-effect)
  const [prevIsEnriching, setPrevIsEnriching] = useState(false);
  if (isMinifigEnriching && !prevIsEnriching) {
    setPrevIsEnriching(true);
    setToastDismissedForCycle(false);
  } else if (!isMinifigEnriching && prevIsEnriching) {
    setPrevIsEnriching(false);
  }

  // Derive toast visibility: show when enriching or error exists, unless manually dismissed
  const showEnrichmentToast =
    (isMinifigEnriching || !!minifigEnrichmentError) && !toastDismissedForCycle;

  const handleDismissEnrichmentToast = useCallback(() => {
    setToastDismissedForCycle(true);
  }, []);

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

  const {
    broadcastPieceDelta,
    broadcastOwnedSnapshot,
    connectionState,
    hasConnectedOnce,
  } = useGroupSessionChannel({
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

  const handleExportOpen = useMemo(
    () => ({
      open: () => setExportOpen(true),
      close: () => setExportOpen(false),
    }),
    []
  );

  const pinnedAdapter = useMemo(
    () => ({
      toggle: (key: string) =>
        pinnedStore.togglePinned({
          setNumber,
          key,
          ...(setName ? { setName } : {}),
        }),
      isPinned: (key: string) => pinnedStore.isPinned(setNumber, key),
    }),
    [pinnedStore, setNumber, setName]
  );

  return (
    <InventoryTableView
      setNumber={setNumber}
      {...(setName ? { setName } : {})}
      rows={rows}
      keys={keys}
      ownedByKey={ownedByKey}
      minifigStatusByKey={minifigStatusByKey}
      isLoading={isLoading}
      error={error}
      isMinifigEnriching={isMinifigEnriching}
      minifigEnrichmentError={minifigEnrichmentError}
      retryMinifigEnrichment={retryMinifigEnrichment}
      sortKey={sortKey}
      sortDir={sortDir}
      filter={filter}
      view={view}
      itemSize={itemSize}
      groupBy={groupBy}
      setSortKey={setSortKey}
      setSortDir={setSortDir}
      setFilter={setFilter}
      setView={setView}
      setItemSize={setItemSize}
      setGroupBy={group => setGroupBy((group ?? 'none') as typeof groupBy)}
      sortedIndices={sortedIndices}
      subcategoriesByParent={subcategoriesByParent}
      colorOptions={colorOptions}
      countsByParent={countsByParent}
      parentOptions={parentOptions}
      gridSizes={gridSizes}
      exportOpen={exportOpen}
      showEnrichmentToast={showEnrichmentToast}
      onDismissEnrichmentToast={handleDismissEnrichmentToast}
      handleExportOpen={handleExportOpen}
      pricesByKey={pricesByKey}
      pendingPriceKeys={pendingKeys}
      {...(handlePricesForKeys
        ? { requestPricesForKeys: handlePricesForKeys }
        : {})}
      pinnedStore={pinnedAdapter}
      handleOwnedChange={handleOwnedChange}
      migration={migration}
      isMigrating={isMigrating}
      confirmMigration={confirmMigration}
      keepCloudData={keepCloudData}
      broadcastPieceDelta={broadcastPieceDelta}
      connectionState={connectionState}
      hasConnectedOnce={hasConnectedOnce}
      isInGroupSession={Boolean(groupSessionId)}
    />
  );
}
