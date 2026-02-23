'use client';

import { useControlBarDropdown } from '@/app/hooks/useControlBarDropdown';
import { useEffect, useRef, useState } from 'react';
import { TopBarControls } from './controls/TopBarControls';
import {
  useInventoryData,
  useInventoryControls as useControls,
  useInventoryPinned,
  useInventoryUI,
} from './InventoryProvider';

type InventoryControlsProps = {
  /** When true, sidebar triggers are disabled (data not yet loaded) */
  isLoading?: boolean | undefined;
};

export function InventoryControls({ isLoading }: InventoryControlsProps) {
  const { setNumber, setName, scrollerKey, markAllMissing, markAllComplete } =
    useInventoryData();
  const {
    view,
    setView,
    itemSize,
    setItemSize,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    groupBy,
    setGroupBy,
    filter,
    setFilter,
    parentOptions,
    countsByParent,
    subcategoriesByParent,
    colorOptions,
    availableColors,
  } = useControls();
  const { openExportModal } = useInventoryUI();
  const { getPinnedCount } = useInventoryPinned();

  const {
    openDropdownId,
    toggleDropdown,
    closeDropdown,
    containerRef,
    isDesktop,
  } = useControlBarDropdown({ keepOpenIds: ['parent', 'color'] });

  const [isParentOpen, setIsParentOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);

  // Scroll to top when display filter, sort, or grouping changes
  // Skip initial render by tracking if values have changed
  const prevFilterRef = useRef({ display: filter.display, sortKey, groupBy });
  useEffect(() => {
    const prev = prevFilterRef.current;
    const changed =
      prev.display !== filter.display ||
      prev.sortKey !== sortKey ||
      prev.groupBy !== groupBy;

    // Update ref for next comparison
    prevFilterRef.current = { display: filter.display, sortKey, groupBy };

    // Don't scroll on initial render, only on actual changes
    if (!changed) return;

    if (isDesktop) {
      const scroller = document.querySelector(
        `[data-inventory-scroller="${scrollerKey}"]`
      );
      if (scroller) scroller.scrollTop = 0;
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [filter.display, sortKey, groupBy, isDesktop, scrollerKey]);

  const handleDropdownToggle = (id: string) => {
    if (isDesktop && (id === 'parent' || id === 'color')) {
      if (id === 'parent') setIsParentOpen(prev => !prev);
      else setIsColorOpen(prev => !prev);
      return;
    }
    toggleDropdown(id);
  };

  const handleDropdownChange = (
    dropdownId: string,
    groupId: string,
    key: string
  ) => {
    // Close dropdown after selection, except for desktop sidebar panels
    if (!(isDesktop && (dropdownId === 'parent' || dropdownId === 'color'))) {
      closeDropdown();
    }

    if (dropdownId === 'display') {
      if (groupId !== 'display') return;
      if (key === 'all' || key === 'missing' || key === 'owned') {
        setFilter({ ...filter, display: key });
      }
    } else if (dropdownId === 'sort') {
      if (groupId === 'sortBy')
        setSortKey(
          key as 'name' | 'color' | 'size' | 'category' | 'price' | 'rarity'
        );
      else if (groupId === 'order') {
        if (key !== sortDir) setSortDir(key === 'asc' ? 'asc' : 'desc');
      } else if (groupId === 'groupBy')
        setGroupBy(key as 'none' | 'color' | 'size' | 'category' | 'rarity');
    } else if (dropdownId === 'view') {
      if (groupId === 'viewMode') {
        setView(key as 'list' | 'grid');
      } else if (groupId === 'itemSize') {
        setItemSize(key as 'sm' | 'md' | 'lg');
      }
    } else if (dropdownId === 'color') {
      if (isDesktop) setIsColorOpen(true);
    }
  };

  const handleToggleColor = (color: string) => {
    const exists = filter.colors.includes(color);
    setFilter({
      ...filter,
      colors: exists
        ? filter.colors.filter(c => c !== color)
        : [...filter.colors, color],
    });
  };

  return (
    <div
      ref={containerRef}
      className="flex h-controls-height w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto border-b border-subtle bg-card-muted px-2 no-scrollbar lg:col-start-2 lg:overflow-visible"
    >
      <TopBarControls
        setNumber={setNumber}
        {...(setName ? { setName } : {})}
        view={view}
        onChangeView={setView}
        itemSize={itemSize}
        onChangeItemSize={setItemSize}
        sortKey={sortKey}
        onChangeSortKey={setSortKey}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
        groupBy={groupBy}
        onChangeGroupBy={setGroupBy}
        displayKey={filter.display}
        onChangeDisplay={(next: 'all' | 'missing' | 'owned') =>
          handleDropdownChange('display', 'display', next)
        }
        openDropdownId={openDropdownId}
        onToggleDropdown={handleDropdownToggle}
        onCloseDropdown={id => {
          if (openDropdownId === id) closeDropdown();
        }}
        pinnedCount={getPinnedCount()}
        onMarkAllMissing={markAllMissing}
        onMarkAllComplete={markAllComplete}
        filter={filter}
        onChangeFilter={setFilter}
        parentOptions={parentOptions}
        parentCounts={countsByParent}
        subcategoriesByParent={subcategoriesByParent}
        colorOptions={colorOptions}
        availableColors={availableColors}
        onToggleColor={handleToggleColor}
        isDesktop={isDesktop}
        isParentOpen={isParentOpen}
        isColorOpen={isColorOpen}
        onOpenExportModal={openExportModal}
        isLoading={isLoading}
      />
    </div>
  );
}
