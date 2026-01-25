'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { Inventory } from '@/app/components/set/Inventory';
import { InventoryControls } from '@/app/components/set/InventoryControls';
import {
  InventoryProvider,
  useInventoryContext,
} from '@/app/components/set/InventoryProvider';
import type { InventoryRow } from '@/app/components/set/types';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import type { OpenTab, TabViewState } from '@/app/store/open-tabs';
import { addRecentSet } from '@/app/store/recent-sets';

type SetTabContainerProps = {
  tab: OpenTab;
  isActive: boolean;
  savedScrollTop?: number;
  savedControlsState?: TabViewState;
  onSaveState: (state: Partial<TabViewState>) => void;
  /** Whether to use desktop scroll behavior */
  isDesktop?: boolean;
};

type InventoryData = {
  rows: InventoryRow[];
  loading: boolean;
  error: string | null;
};

/**
 * Container for a single set tab.
 *
 * - When active: mounts children (SetTopBar, InventoryControls, Inventory)
 * - When inactive: hidden with display:none
 * - Scroll position is saved/restored on the Inventory grid wrapper
 */
export function SetTabContainer({
  tab,
  isActive,
  savedScrollTop,
  savedControlsState,
  onSaveState,
  isDesktop,
}: SetTabContainerProps) {
  const clientId = useGroupClientId();

  // Client-side inventory data fetching
  const [inventoryData, setInventoryData] = useState<InventoryData>({
    rows: [],
    loading: true,
    error: null,
  });

  // Fetch inventory when tab becomes active (if not already loaded)
  useEffect(() => {
    if (!isActive) return;
    if (inventoryData.rows.length > 0 && !inventoryData.loading) return;

    let cancelled = false;

    const fetchInventory = async () => {
      try {
        const res = await fetch(
          `/api/inventory?set=${encodeURIComponent(tab.setNumber)}`
        );
        if (!res.ok) {
          throw new Error('Failed to fetch inventory');
        }
        const data = (await res.json()) as { rows: InventoryRow[] };
        if (!cancelled) {
          setInventoryData({ rows: data.rows, loading: false, error: null });
        }
      } catch (err) {
        if (!cancelled) {
          setInventoryData({
            rows: [],
            loading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    };

    void fetchInventory();

    return () => {
      cancelled = true;
    };
  }, [
    isActive,
    tab.setNumber,
    inventoryData.rows.length,
    inventoryData.loading,
  ]);

  // Add to recent sets when tab becomes active
  useEffect(() => {
    if (isActive) {
      addRecentSet({
        setNumber: tab.setNumber,
        name: tab.name,
        year: tab.year,
        imageUrl: tab.imageUrl,
        numParts: tab.numParts,
        themeId: null,
        themeName: null,
      });
    }
  }, [isActive, tab.setNumber, tab.name, tab.year, tab.imageUrl, tab.numParts]);

  // Compute container style
  const containerStyle = useMemo(() => {
    if (isActive) {
      return { display: 'flex' };
    }
    return { display: 'none' };
  }, [isActive]);

  return (
    <div
      data-set-number={tab.setNumber}
      data-active={isActive}
      style={containerStyle}
      className="tab-container flex-col lg:min-h-0 lg:flex-1"
    >
      {isActive && (
        <InventoryProvider
          setNumber={tab.setNumber}
          setName={tab.name}
          initialInventory={inventoryData.loading ? null : inventoryData.rows}
          initialControlsState={savedControlsState}
          enableCloudSync
          isActive={isActive}
          groupSessionId={null}
          groupParticipantId={null}
          groupClientId={clientId}
        >
          <SetTabContainerContent
            tab={tab}
            loading={inventoryData.loading}
            error={inventoryData.error}
            onSaveState={onSaveState}
            savedScrollTop={savedScrollTop}
            isDesktop={isDesktop}
          />
        </InventoryProvider>
      )}
    </div>
  );
}

type SetTabContainerContentProps = {
  tab: OpenTab;
  loading: boolean;
  error: string | null;
  onSaveState: (state: Partial<TabViewState>) => void;
  savedScrollTop?: number | undefined;
  isDesktop?: boolean | undefined;
};

function SetTabContainerContent({
  tab,
  loading,
  error,
  onSaveState,
  savedScrollTop,
  isDesktop,
}: SetTabContainerContentProps) {
  const { setNumber, getControlsState } = useInventoryContext();
  const hasRestoredScroll = useRef(false);

  // Save controls state on unmount (when tab becomes inactive)
  const getControlsStateRef = useRef(getControlsState);
  getControlsStateRef.current = getControlsState;

  const onSaveStateRef = useRef(onSaveState);
  onSaveStateRef.current = onSaveState;

  useEffect(() => {
    return () => {
      // Save controls state when unmounting
      const state = getControlsStateRef.current();
      onSaveStateRef.current({
        filter: state.filter,
        sortKey: state.sortKey,
        sortDir: state.sortDir,
        view: state.view,
        itemSize: state.itemSize,
        groupBy: state.groupBy,
      });
    };
  }, []);

  // Restore scroll position after inventory loads
  useEffect(() => {
    if (loading) return;
    if (hasRestoredScroll.current) return;
    if (typeof savedScrollTop !== 'number') return;

    hasRestoredScroll.current = true;

    // Use requestAnimationFrame to ensure Inventory has rendered
    requestAnimationFrame(() => {
      if (isDesktop) {
        const scroller = document.querySelector(
          `[data-inventory-scroller="${setNumber}"]`
        );
        if (scroller) {
          scroller.scrollTop = savedScrollTop;
        }
      } else {
        window.scrollTo(0, savedScrollTop);
      }
    });
  }, [loading, savedScrollTop, isDesktop, setNumber]);

  // Render content - SetTopBar always visible, inventory shows loading/error/content
  return (
    <>
      {/* Top bar with set info - always visible, sticky on mobile */}
      <div className="sticky top-10 z-50 shrink-0 bg-card lg:static">
        <SetTopBar
          setNumber={tab.setNumber}
          setName={tab.name}
          imageUrl={tab.imageUrl}
          year={tab.year}
          numParts={tab.numParts}
          themeId={null}
        />
        {!loading && !error && <InventoryControls />}
      </div>

      {/* Inventory content */}
      {loading ? (
        <div className="flex h-[50vh] items-center justify-center">
          <BrickLoader />
        </div>
      ) : error ? (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-foreground-muted">Failed to load set inventory</p>
          <p className="text-sm text-foreground-muted">{error}</p>
        </div>
      ) : (
        <Inventory />
      )}
    </>
  );
}
