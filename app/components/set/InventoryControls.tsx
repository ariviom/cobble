'use client';

import {
  DropdownPanelFrame,
  DropdownTrigger,
  formatMultiSelectLabel,
} from '@/app/components/ui/GroupedDropdown';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { FolderTree, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SidebarCategoryPanel } from './controls/SidebarCategoryPanel';
import { SidebarColorPanel } from './controls/SidebarColorPanel';
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
};

export function InventoryControls({
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
  filter,
  onChangeFilter,
  parentOptions,
  parentCounts,
  subcategoriesByParent,
  colorOptions,
  onToggleColor,
}: Props) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [isParentOpen, setIsParentOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);

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

  // Helper function to get color dropdown label
  const getColorLabel = () =>
    formatMultiSelectLabel('Colors', filter.colors || []);

  // Removed legacy category helpers; encapsulated in SidebarCategoryPanel

  return (
    <div
      ref={containerRef}
      className="fixed top-topnav-height z-50 flex h-controls-height w-full max-w-screen flex-nowrap items-center gap-2 overflow-x-auto border-b border-neutral-300 bg-neutral-50 px-2 no-scrollbar lg:top-filter-offset lg:overflow-visible"
    >
      <TopBarControls
        setNumber={setNumber}
        setName={setName}
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
      />
      {/* Sidebar Group Triggers */}
      <div className="sidebar relative min-w-fit border-neutral-300 lg:fixed lg:top-nav-height lg:left-0 lg:h-[calc(100dvh-var(--spacing-nav-height))] lg:w-80 lg:overflow-y-auto lg:border-r lg:bg-neutral-00">
        <div className="flex flex-nowrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-1">
          {/* display panel is rendered by TopBarControls; removed duplicate */}
          {parentOptions.length > 0 ? (
            <div className="lg:relative">
              <DropdownTrigger
                id="parent-trigger"
                panelId="parent-panel"
                label={formatMultiSelectLabel('Pieces', filter.parents || [])}
                labelIcon={<FolderTree size={16} />}
                isOpen={isDesktop ? isParentOpen : openDropdownId === 'parent'}
                onToggle={() => handleDropdownToggle('parent')}
                variant="sidebar"
              />
              {(isDesktop ? isParentOpen : openDropdownId === 'parent') && (
                <DropdownPanelFrame
                  id="parent-panel"
                  labelledBy="parent-trigger"
                  isOpen={true}
                  variant="sidebar"
                >
                  <SidebarCategoryPanel
                    filter={filter}
                    onChangeFilter={onChangeFilter}
                    parentOptions={parentOptions}
                    subcategoriesByParent={subcategoriesByParent}
                    parentCounts={parentCounts}
                  />
                </DropdownPanelFrame>
              )}
            </div>
          ) : null}

          {colorOptions && colorOptions.length > 0 ? (
            <div className="lg:relative">
              <DropdownTrigger
                id="color-trigger"
                panelId="color-panel"
                label={
                  isDesktop ? (
                    <span>
                      Colors
                      {(filter.colors?.length || 0) > 0 ? (
                        <span className="ml-2 text-sm text-neutral-400">
                          ({filter.colors!.join(', ')})
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    getColorLabel()
                  )
                }
                labelIcon={<Palette size={16} />}
                isOpen={isDesktop ? isColorOpen : openDropdownId === 'color'}
                onToggle={() => handleDropdownToggle('color')}
                variant="sidebar"
              />
              {(isDesktop ? isColorOpen : openDropdownId === 'color') && (
                <DropdownPanelFrame
                  id="color-panel"
                  labelledBy="color-trigger"
                  isOpen={true}
                  variant="sidebar"
                >
                  <SidebarColorPanel
                    colorOptions={colorOptions}
                    selectedColors={filter.colors || []}
                    onToggleColor={onToggleColor}
                    onClear={() => onChangeFilter({ ...filter, colors: [] })}
                  />
                </DropdownPanelFrame>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
