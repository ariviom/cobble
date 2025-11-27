'use client';

import { useInventory } from '@/app/hooks/useInventory';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { useEffect, useRef, useState } from 'react';
import { TopBarControls } from './controls/TopBarControls';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  SortKey,
  ViewType,
} from './types';

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
  filter: InventoryFilter;
  onChangeFilter: (f: InventoryFilter) => void;
  parentOptions: string[];
  parentCounts?: Record<string, number>;
  subcategoriesByParent: Record<string, string[]>;
  colorOptions: string[];
  onToggleColor: (color: string) => void;
  onOpenExportModal: () => void;
};

export function InventoryControls(props: Props) {
  const {
    setNumber,
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
    filter,
    onChangeFilter,
    parentOptions,
    parentCounts,
    subcategoriesByParent,
    colorOptions,
    onToggleColor,
    onOpenExportModal,
  } = props;
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [isParentOpen, setIsParentOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);
  const ownedStore = useOwnedStore();
  const { keys, required } = useInventory(setNumber);
  const pinnedState = usePinnedStore();
  const pinnedCount = pinnedState.getPinnedKeysForSet(setNumber).length;

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        // Keep sidebar panels open on desktop; allow outside-click to close otherwise
        if (
          isDesktop &&
          (openDropdownId === 'parent' || openDropdownId === 'color')
        ) {
          return;
        }
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isDesktop, openDropdownId]);

  // Close dropdown on escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // When the pinned panel is open, prevent scrolling on the root to make it feel modal-like
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const isPinnedOpen = openDropdownId === 'pinned';
    const prevOverflow = root.style.overflow;
    if (isPinnedOpen) {
      root.style.overflow = 'hidden';
    }
    return () => {
      root.style.overflow = prevOverflow;
    };
  }, [openDropdownId]);

  const handleDropdownToggle = (id: string) => {
    if (isDesktop && (id === 'parent' || id === 'color')) {
      if (id === 'parent') setIsParentOpen(prev => !prev);
      else setIsColorOpen(prev => !prev);
      return;
    }
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  const handleDropdownChange = (
    dropdownId: string,
    groupId: string,
    key: string
  ) => {
    // Close dropdown after selection, except for the desktop sidebar panels
    if (!(isDesktop && (dropdownId === 'parent' || dropdownId === 'color'))) {
      setOpenDropdownId(null);
    }

    // Handle the actual change based on dropdown type
    if (dropdownId === 'display') {
      if (groupId !== 'display') return;
      if (key === 'all' || key === 'missing' || key === 'owned') {
        onChangeFilter({
          ...filter,
          display: key,
        });
      }
    } else if (dropdownId === 'sort') {
      if (groupId === 'sortBy') onChangeSortKey(key as SortKey);
      else if (groupId === 'order') {
        if (key !== sortDir) onToggleSortDir();
      } else if (groupId === 'groupBy') onChangeGroupBy(key as GroupBy);
    } else if (dropdownId === 'view') {
      if (groupId === 'viewMode') {
        onChangeView(key as ViewType);
      } else if (groupId === 'itemSize') {
        onChangeItemSize(key as ItemSize);
      }
    } else if (dropdownId === 'color') {
      // remain open on desktop
      if (isDesktop) setIsColorOpen(true);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed top-topnav-height z-50 flex h-controls-height w-full flex-nowrap items-center gap-2 overflow-x-auto border-b border-border-subtle bg-background-muted px-2 transition-[top] no-scrollbar lg:static lg:top-auto lg:overflow-visible"
    >
      <TopBarControls
        setNumber={setNumber}
        {...(props.setName ? { setName: props.setName } : {})}
        view={view}
        onChangeView={onChangeView}
        itemSize={itemSize}
        onChangeItemSize={onChangeItemSize}
        sortKey={sortKey}
        onChangeSortKey={onChangeSortKey}
        sortDir={sortDir}
        onToggleSortDir={onToggleSortDir}
        groupBy={groupBy}
        onChangeGroupBy={onChangeGroupBy}
        displayKey={filter.display}
        onChangeDisplay={(next: 'all' | 'missing' | 'owned') =>
          handleDropdownChange('display', 'display', next)
        }
        openDropdownId={openDropdownId}
        onToggleDropdown={handleDropdownToggle}
        onCloseDropdown={id =>
          setOpenDropdownId(prev => (prev === id ? null : prev))
        }
        pinnedCount={pinnedCount}
        onMarkAllMissing={() => ownedStore.clearAll(setNumber)}
        onMarkAllComplete={() =>
          ownedStore.markAllAsOwned(setNumber, keys, required)
        }
        filter={filter}
        onChangeFilter={onChangeFilter}
        parentOptions={parentOptions}
        {...(parentCounts ? { parentCounts } : {})}
        subcategoriesByParent={subcategoriesByParent}
        colorOptions={colorOptions}
        onToggleColor={onToggleColor}
        isDesktop={isDesktop}
        isParentOpen={isParentOpen}
        isColorOpen={isColorOpen}
        onOpenExportModal={onOpenExportModal}
      />
    </div>
  );
}
