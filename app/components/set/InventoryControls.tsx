'use client';

import {
  CheckboxList,
  DropdownPanelFrame,
  DropdownSection,
  DropdownTrigger,
  GroupedList,
  SingleSelectList,
  formatMultiSelectLabel,
} from '@/app/components/ui/GroupedDropdown';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  FolderTree,
  Grid,
  List,
  Palette,
  SortAsc,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  SortKey,
  ViewType,
} from './types';

type Props = {
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
  onSelectParent: (parent: string | null) => void;
  subcategoryOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
  onToggleSubcategory: (subcategory: string) => void;
  onClearSubcategories: () => void;
  colorOptions: string[];
  onToggleColor: (color: string) => void;
};

export function InventoryControls({
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
  onSelectParent,
  subcategoryOptions,
  subcategoriesByParent,
  onToggleSubcategory,
  onClearSubcategories,
  colorOptions,
  onToggleColor,
}: Props) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDesktopCategory, setActiveDesktopCategory] = useState<
    string | null
  >(null);
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
    } else if (dropdownId === 'parent') {
      if (groupId !== 'parent') return;
      if (key === '__all__') {
        onSelectParent(null);
      } else {
        onSelectParent(key);
      }
      // remain open on desktop
      if (isDesktop) setIsParentOpen(true);
    } else if (dropdownId === 'color') {
      // remain open on desktop
      if (isDesktop) setIsColorOpen(true);
    }
  };

  // Helper function to get color dropdown label
  const getColorLabel = () =>
    formatMultiSelectLabel('Colors', filter.colors || []);

  function getParentState(parent: string): 'none' | 'some' | 'all' {
    if (filter.parent !== parent) return 'none';
    const all = subcategoriesByParent[parent] ?? [];
    const selected = filter.subcategories || [];
    if (selected.length === 0) return 'none';
    if (all.length > 0 && selected.length === all.length) return 'all';
    return 'some';
  }

  function toggleParentCheckbox(parent: string) {
    if (parent === '__all__') {
      onChangeFilter({ ...filter, parent: null, subcategories: [] });
      return;
    }
    const allSubcats = subcategoriesByParent[parent] ?? [];
    const state = getParentState(parent);
    if (filter.parent !== parent) {
      onChangeFilter({ ...filter, parent, subcategories: allSubcats });
    } else if (state === 'all') {
      // Uncheck parent: clear filter
      onChangeFilter({ ...filter, parent: null, subcategories: [] });
    } else {
      // From none or some -> select all
      onChangeFilter({ ...filter, parent, subcategories: allSubcats });
    }
  }

  function toggleSubcategoryForActive(sub: string) {
    const parent = activeDesktopCategory;
    if (!parent) return;
    if (filter.parent !== parent) {
      // Start selection for this parent
      onChangeFilter({
        ...filter,
        parent,
        subcategories: [sub],
      });
      return;
    }
    const exists = (filter.subcategories || []).includes(sub);
    onChangeFilter({
      ...filter,
      subcategories: exists
        ? (filter.subcategories || []).filter(c => c !== sub)
        : [...(filter.subcategories || []), sub],
    });
  }

  return (
    <div
      ref={containerRef}
      className="no-scrollbar flex h-controls-height flex-nowrap items-center gap-2 overflow-x-auto border-b border-neutral-300 px-3 lg:overflow-visible"
    >
      {/* Display Dropdown: All / Missing / Owned */}
      <div className="lg:relative">
        <DropdownTrigger
          id="display-trigger"
          panelId="display-panel"
          label={
            filter.display === 'owned'
              ? 'Owned'
              : filter.display === 'missing'
                ? 'Missing'
                : 'All'
          }
          labelIcon={<Filter size={16} />}
          isOpen={openDropdownId === 'display'}
          onToggle={() => handleDropdownToggle('display')}
        />
        {openDropdownId === 'display' && (
          <DropdownPanelFrame
            id="display-panel"
            labelledBy="display-trigger"
            isOpen={true}
            className="lg:right-0"
          >
            <DropdownSection label="Filter By">
              <SingleSelectList
                options={[
                  { key: 'all', text: 'All' },
                  { key: 'missing', text: 'Missing' },
                  { key: 'owned', text: 'Owned' },
                ]}
                selectedKey={filter.display}
                onChange={key =>
                  handleDropdownChange('display', 'display', key)
                }
              />
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>

      {/* Sort Dropdown: Sort By / Order / Group By */}
      <div className="lg:relative">
        <DropdownTrigger
          id="sort-trigger"
          panelId="sort-panel"
          label="Sort"
          labelIcon={<SortAsc size={16} />}
          isOpen={openDropdownId === 'sort'}
          onToggle={() => handleDropdownToggle('sort')}
        />
        {openDropdownId === 'sort' && (
          <DropdownPanelFrame
            id="sort-panel"
            labelledBy="sort-trigger"
            isOpen={true}
            className="lg:right-0"
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
                  onChange: k => handleDropdownChange('sort', 'sortBy', k),
                },
                {
                  id: 'order',
                  label: 'Order',
                  options: [
                    { key: 'asc', text: 'Ascending' },
                    { key: 'desc', text: 'Descending' },
                  ],
                  selectedKey: sortDir,
                  onChange: k => handleDropdownChange('sort', 'order', k),
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
                  onChange: k => handleDropdownChange('sort', 'groupBy', k),
                },
              ]}
            />
          </DropdownPanelFrame>
        )}
      </div>
      {/* View Options Dropdown: separate groups for View and Size */}
      <div className="lg:relative">
        <DropdownTrigger
          id="view-trigger"
          panelId="view-panel"
          label={view === 'grid' ? 'Grid' : 'List'}
          labelIcon={view === 'grid' ? <Grid size={16} /> : <List size={16} />}
          isOpen={openDropdownId === 'view'}
          onToggle={() => handleDropdownToggle('view')}
        />
        {openDropdownId === 'view' && (
          <DropdownPanelFrame
            id="view-panel"
            labelledBy="view-trigger"
            isOpen={true}
            className="lg:right-0"
          >
            <DropdownSection label="View">
              <SingleSelectList
                options={[
                  { key: 'list', text: 'List', icon: <List size={16} /> },
                  { key: 'grid', text: 'Grid', icon: <Grid size={16} /> },
                ]}
                selectedKey={view}
                onChange={k => handleDropdownChange('view', 'viewMode', k)}
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
                onChange={k => handleDropdownChange('view', 'itemSize', k)}
              />
            </DropdownSection>
          </DropdownPanelFrame>
        )}
      </div>
      {/* Sidebar Group Triggers */}
      <div className="sidebar relative min-w-fit border-neutral-300 lg:fixed lg:top-topnav-height lg:left-0 lg:h-[calc(100vh-var(--spacing-topnav-height))] lg:w-80 lg:overflow-y-auto lg:border-r lg:bg-neutral-00">
        <div className="flex flex-nowrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-1">
          {parentOptions.length > 0 ? (
            <div className="lg:relative">
              <DropdownTrigger
                id="parent-trigger"
                panelId="parent-panel"
                label={filter.parent ?? 'All Pieces'}
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
                  {activeDesktopCategory === null ? (
                    <>
                      <DropdownSection label="Category">
                        <div>
                          {/* All Pieces */}
                          <button
                            type="button"
                            className={
                              (filter.parent ?? '__all__') === '__all__'
                                ? 'flex w-full items-center gap-2 bg-blue-50 px-3 py-2 text-left text-sm text-blue-700'
                                : 'flex w-full items-center gap-2 bg-background px-3 py-2 text-left text-sm text-foreground hover:bg-neutral-100'
                            }
                            onClick={() => toggleParentCheckbox('__all__')}
                          >
                            <input
                              type="checkbox"
                              checked={
                                (filter.parent ?? '__all__') === '__all__'
                              }
                              onChange={() => {}}
                              className="pointer-events-none"
                              tabIndex={-1}
                            />
                            <span>All Pieces</span>
                          </button>

                          {/* Parents */}
                          {parentOptions.map(parent => {
                            const state = getParentState(parent);
                            const selected = filter.parent === parent;
                            const subCount = (
                              subcategoriesByParent[parent] || []
                            ).length;
                            return (
                              <div key={parent} className="relative">
                                <button
                                  type="button"
                                  className={
                                    selected
                                      ? 'flex w-full items-center gap-2 bg-blue-50 px-3 py-2 text-left text-sm text-blue-700'
                                      : 'flex w-full items-center gap-2 bg-background px-3 py-2 text-left text-sm text-foreground hover:bg-neutral-100'
                                  }
                                  onClick={() => toggleParentCheckbox(parent)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={state === 'all'}
                                    ref={el => {
                                      if (el)
                                        el.indeterminate = state === 'some';
                                    }}
                                    onChange={() => {}}
                                    aria-checked={
                                      state === 'some' ? 'mixed' : undefined
                                    }
                                    className="pointer-events-none"
                                    tabIndex={-1}
                                  />
                                  <span>{parent}</span>
                                </button>
                                {subCount > 1 && (
                                  <button
                                    type="button"
                                    className="absolute top-0 right-0 h-full w-10 text-foreground-muted hover:text-foreground"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setActiveDesktopCategory(parent);
                                    }}
                                    aria-label={`Show ${parent} subcategories`}
                                  >
                                    <ChevronRight size={18} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </DropdownSection>
                    </>
                  ) : (
                    <>
                      <DropdownSection>
                        <div className="flex items-center gap-2 px-3 py-2">
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-neutral-100"
                            onClick={() => setActiveDesktopCategory(null)}
                            aria-label="Back to categories"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <span className="text-sm font-semibold">
                            {activeDesktopCategory}
                          </span>
                        </div>
                      </DropdownSection>
                      <DropdownSection>
                        <div>
                          {(
                            subcategoriesByParent[activeDesktopCategory] ?? []
                          ).map(sub => {
                            const selected =
                              filter.parent === activeDesktopCategory &&
                              (filter.subcategories || []).includes(sub);
                            return (
                              <button
                                key={sub}
                                type="button"
                                className={
                                  selected
                                    ? 'flex w-full items-center gap-3 bg-blue-50 px-3 py-3 text-left text-[0.95rem] text-blue-700'
                                    : 'flex w-full items-center gap-3 bg-background px-3 py-3 text-left text-[0.95rem] text-foreground hover:bg-neutral-100'
                                }
                                onClick={() => toggleSubcategoryForActive(sub)}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {}}
                                  className="pointer-events-none size-5"
                                  tabIndex={-1}
                                />
                                <span>{sub}</span>
                                <span className="ml-auto inline-flex h-full w-10 items-center justify-center text-foreground-muted">
                                  <ChevronRight size={18} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </DropdownSection>
                    </>
                  )}
                </DropdownPanelFrame>
              )}
            </div>
          ) : null}

          {colorOptions && colorOptions.length > 0 ? (
            <div className="lg:relative">
              <DropdownTrigger
                id="color-trigger"
                panelId="color-panel"
                label={getColorLabel()}
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
                  <DropdownSection label="Colors">
                    <CheckboxList
                      options={(colorOptions || []).map(c => ({
                        key: c,
                        text: c === '-' ? 'Minifigures' : c,
                      }))}
                      selectedKeys={filter.colors || []}
                      onToggle={onToggleColor}
                    />
                  </DropdownSection>
                  {(filter.colors?.length || 0) > 0 && (
                    <DropdownSection label="">
                      <div className="px-3 py-2">
                        <button
                          type="button"
                          className="ml-auto inline-flex items-center rounded border border-foreground-accent px-2 py-1 text-xs hover:bg-neutral-100"
                          onClick={() =>
                            onChangeFilter({ ...filter, colors: [] })
                          }
                        >
                          Clear
                        </button>
                      </div>
                    </DropdownSection>
                  )}
                </DropdownPanelFrame>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
