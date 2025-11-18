'use client';

import { InventoryItem } from '@/app/components/set/items/InventoryItem';
import {
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
} from '@/app/components/ui/GroupedDropdown';
import { useInventory } from '@/app/hooks/useInventory';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { Filter, Grid, List, Pin, SortAsc } from 'lucide-react';
import { useState } from 'react';
import { clampOwned, computeMissing } from '../inventory-utils';
import type {
  GroupBy,
  InventoryRow,
  ItemSize,
  SortKey,
  ViewType,
} from '../types';

type Props = {
  setNumber: string;
  setName?: string;
  view: ViewType;
  onChangeView: (v: ViewType) => void;
  itemSize: ItemSize;
  onChangeItemSize: (s: ItemSize) => void;
  sortKey: SortKey;
  onChangeSortKey: (k: SortKey) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
  groupBy: GroupBy;
  onChangeGroupBy: (g: GroupBy) => void;
  displayKey: 'all' | 'missing' | 'owned';
  onChangeDisplay: (next: 'all' | 'missing' | 'owned') => void;
  openDropdownId: string | null;
  onToggleDropdown: (id: string) => void;
  onCloseDropdown: (id: 'display' | 'sort' | 'view') => void;
};

export function TopBarControls({
  setNumber,
  setName,
  view,
  onChangeView,
  itemSize,
  onChangeItemSize,
  sortKey,
  onChangeSortKey,
  sortDir,
  onToggleSortDir,
  groupBy,
  onChangeGroupBy,
  displayKey,
  onChangeDisplay,
  openDropdownId,
  onToggleDropdown,
  onCloseDropdown,
}: Props) {
  const isDesktop = useIsDesktop();
  const pinnedState = usePinnedStore();
  const pinnedCount = pinnedState.getPinnedKeysForSet(setNumber).length;
  return (
    <>
      <div className="lg:relative">
        <DropdownTrigger
          id="display-trigger"
          panelId="display-panel"
          label={
            displayKey === 'owned'
              ? 'Owned'
              : displayKey === 'missing'
                ? 'Missing'
                : 'All'
          }
          labelIcon={<Filter size={16} />}
          isOpen={openDropdownId === 'display'}
          onToggle={() => onToggleDropdown('display')}
        />
        {openDropdownId === 'display' && (
          <DropdownPanelFrame
            id="display-panel"
            labelledBy="display-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <DropdownSection label="Filter By">
              <SingleSelectList
                options={[
                  { key: 'all', text: 'All' },
                  { key: 'missing', text: 'Missing' },
                  { key: 'owned', text: 'Owned' },
                ]}
                selectedKey={displayKey}
                onChange={k =>
                  onChangeDisplay(k as 'all' | 'missing' | 'owned')
                }
              />
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="sort-trigger"
          panelId="sort-panel"
          label="Sort"
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => onToggleDropdown('sort')}
        />
        {openDropdownId === 'sort' && (
          <DropdownPanelFrame
            id="sort-panel"
            labelledBy="sort-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <GroupedList
              sections={[
                {
                  id: 'sortBy',
                  label: 'Sort By',
                  options: [
                    { key: 'name', text: 'Name' },
                    { key: 'color', text: 'Color' },
                    { key: 'size', text: 'Size' },
                    { key: 'category', text: 'Category' },
                  ],
                  selectedKey: sortKey,
                  onChange: k => {
                    onChangeSortKey(k as SortKey);
                    onCloseDropdown('sort');
                  },
                },
                {
                  id: 'order',
                  label: 'Order',
                  options: [
                    { key: 'asc', text: 'Ascending' },
                    { key: 'desc', text: 'Descending' },
                  ],
                  selectedKey: sortDir,
                  onChange: () => {
                    onToggleSortDir();
                    onCloseDropdown('sort');
                  },
                },
                {
                  id: 'groupBy',
                  label: 'Group By',
                  options: [
                    { key: 'none', text: 'None' },
                    { key: 'color', text: 'Color' },
                    { key: 'size', text: 'Size' },
                    { key: 'category', text: 'Category' },
                  ],
                  selectedKey: groupBy,
                  onChange: g => {
                    onChangeGroupBy(g as GroupBy);
                    onCloseDropdown('sort');
                  },
                },
              ]}
            />
          </DropdownPanelFrame>
        )}
      </div>

      <div className="lg:relative">
        <DropdownTrigger
          id="view-trigger"
          panelId="view-panel"
          label={view === 'grid' ? 'Grid' : 'List'}
          labelIcon={view === 'grid' ? <Grid size={16} /> : <List size={16} />}
          isOpen={openDropdownId === 'view'}
          onToggle={() => onToggleDropdown('view')}
        />
        {openDropdownId === 'view' && (
          <DropdownPanelFrame
            id="view-panel"
            labelledBy="view-trigger"
            isOpen={true}
            className={
              isDesktop ? 'lg:top-[calc(100%+0.25rem)] lg:right-0' : ''
            }
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <DropdownSection label="View">
              <SingleSelectList
                options={[
                  { key: 'list', text: 'List', icon: <List size={16} /> },
                  { key: 'grid', text: 'Grid', icon: <Grid size={16} /> },
                ]}
                selectedKey={view}
                onChange={k => {
                  onChangeView(k as ViewType);
                  onCloseDropdown('view');
                }}
              />
            </DropdownSection>
            <DropdownSection label="Size">
              <SingleSelectList
                options={[
                  { key: 'lg', text: 'Large' },
                  { key: 'md', text: 'Medium' },
                  { key: 'sm', text: 'Small' },
                ]}
                selectedKey={itemSize}
                onChange={k => {
                  onChangeItemSize(k as ItemSize);
                  onCloseDropdown('view');
                }}
              />
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>

      <div>
        <DropdownTrigger
          id="pinned-trigger"
          panelId="pinned-panel"
          label={
            <span className="inline-flex items-center gap-2">
              <span>Pinned</span>
              {pinnedCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-200 px-1 text-xs">
                  {pinnedCount}
                </span>
              ) : null}
            </span>
          }
          labelIcon={<Pin size={16} />}
          isOpen={openDropdownId === 'pinned'}
          onToggle={() => onToggleDropdown('pinned')}
        />
        {openDropdownId === 'pinned' && (
          <DropdownPanelFrame
            id="pinned-panel"
            labelledBy="pinned-trigger"
            isOpen={true}
            className="max-h-pinned-panel-height w-full lg:top-[calc(100%+0.5rem)] lg:left-4 lg:max-h-[75dvh] lg:w-[calc(100%-22rem)] lg:shadow-lg"
            variant={isDesktop ? 'default' : 'sidebar'}
          >
            <PinnedPanelContent
              currentSetNumber={setNumber}
              currentSetName={setName}
              view={view}
              itemSize={itemSize}
            />
          </DropdownPanelFrame>
        )}
      </div>
    </>
  );
}

type PinnedPanelContentProps = {
  currentSetNumber: string;
  currentSetName?: string;
  view: ViewType;
  itemSize: ItemSize;
};

function PinnedPanelContent({
  currentSetNumber,
  currentSetName,
  view,
  itemSize,
}: PinnedPanelContentProps) {
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {!hasAnyPins ? (
          <div className="p-4 text-sm text-foreground-muted">
            No pinned pieces yet. Use the pin icon on any piece to add it here.
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-3">
            {currentSetKeys.length > 0 && (
              <PinnedSetSection
                setNumber={currentSetNumber}
                setName={currentSetName}
                pinnedKeys={currentSetKeys}
                view={view}
                itemSize={itemSize}
                gridSizes={gridSizes}
                isCurrent
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
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-neutral-200 text-sm">
        <div className="flex flex-col">
          <label className="flex cursor-pointer items-center gap-4 px-3 py-4 hover:bg-neutral-00">
            <input
              type="checkbox"
              className="size-6 border-neutral-300 accent-theme-primary"
              checked={autoUnpin}
              onChange={e => pinnedState.setAutoUnpin(e.currentTarget.checked)}
            />
            <span>Automatically unpin completed pieces</span>
          </label>
          <label className="flex cursor-pointer items-center gap-4 border-t border-neutral-200 px-3 py-4 hover:bg-neutral-00">
            <input
              type="checkbox"
              className="size-6 border-neutral-300 accent-theme-primary"
              checked={showOtherSets}
              onChange={e =>
                pinnedState.setShowOtherSets(e.currentTarget.checked)
              }
            />
            <span>Show pinned pieces from other sets</span>
          </label>
        </div>
      </div>
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
};

function PinnedSetSection({
  setNumber,
  setName,
  pinnedKeys,
  view,
  itemSize,
  gridSizes,
  isCurrent,
}: PinnedSetSectionProps) {
  const { rows, keys, isLoading, error } = useInventory(setNumber);
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
      <div className="rounded border border-neutral-200 bg-background p-3 text-sm text-foreground-muted">
        Loading pinned pieces for {title}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        Failed to load pinned pieces for {title}.
      </div>
    );
  }

  if (rows.length === 0) return null;

  const keyToIndex = new Map<string, number>();
  keys.forEach((k, idx) => {
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
          const owned = ownedStore.getOwned(setNumber, key);
          const missing = computeMissing(row.quantityRequired, owned);
          return (
            <InventoryItem
              key={key}
              row={row}
              owned={owned}
              missing={missing}
              onOwnedChange={next => {
                const clamped = clampOwned(next, row.quantityRequired);
                ownedStore.setOwned(setNumber, key, clamped);
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
                  setName,
                })
              }
            />
          );
        })}
      </div>
      {pinnedItems.length > visibleCount && (
        <div className="mt-1 flex justify-center">
          <button
            type="button"
            className="rounded border border-neutral-300 px-3 py-1 text-xs"
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
