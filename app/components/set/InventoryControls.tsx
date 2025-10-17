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

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

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
    setOpenDropdownId(openDropdownId === id ? null : id);
  };

  const handleDropdownChange = (
    dropdownId: string,
    groupId: string,
    key: string
  ) => {
    // Close dropdown after selection
    setOpenDropdownId(null);

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
      className="sidebar sticky top-topnav-height z-30 flex flex-col bg-neutral-50 lg:h-[calc(100vh-var(--spacing-topnav-height))] lg:w-80 lg:shrink-0 lg:border-r lg:border-neutral-300"
    >
      {/* Mobile: horizontally scrollable control rail with overlay panel below it */}
      <div className="relative lg:hidden">
        <div className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-neutral-300 px-2 py-2">
          {/* Display Dropdown: All / Missing / Owned */}
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

          {/* Sort Dropdown: Sort By / Order / Group By */}
          <DropdownTrigger
            id="sort-trigger"
            panelId="sort-panel"
            label="Sort"
            labelIcon={<SortAsc size={16} />}
            isOpen={openDropdownId === 'sort'}
            onToggle={() => handleDropdownToggle('sort')}
          />

          {/* View Options Dropdown: separate groups for View and Size */}
          <DropdownTrigger
            id="view-trigger"
            panelId="view-panel"
            label={view === 'grid' ? 'Grid' : 'List'}
            labelIcon={
              view === 'grid' ? <Grid size={16} /> : <List size={16} />
            }
            isOpen={openDropdownId === 'view'}
            onToggle={() => handleDropdownToggle('view')}
          />

          {parentOptions.length > 0 ? (
            <DropdownTrigger
              id="parent-trigger"
              panelId="parent-panel"
              label={filter.parent ?? 'All Pieces'}
              labelIcon={<FolderTree size={16} />}
              isOpen={openDropdownId === 'parent'}
              onToggle={() => handleDropdownToggle('parent')}
            />
          ) : null}

          {colorOptions && colorOptions.length > 0 ? (
            <DropdownTrigger
              id="color-trigger"
              panelId="color-panel"
              label={getColorLabel()}
              labelIcon={<Palette size={16} />}
              isOpen={openDropdownId === 'color'}
              onToggle={() => handleDropdownToggle('color')}
            />
          ) : null}
        </div>

        {/* Overlay panel positioned directly below the control rail */}
        {(() => {
          if (!openDropdownId) return null;
          let id = '';
          let labelledBy = '';
          if (openDropdownId === 'display') {
            id = 'display-panel';
            labelledBy = 'display-trigger';
          } else if (openDropdownId === 'sort') {
            id = 'sort-panel';
            labelledBy = 'sort-trigger';
          } else if (openDropdownId === 'view') {
            id = 'view-panel';
            labelledBy = 'view-trigger';
          } else if (openDropdownId === 'parent') {
            id = 'parent-panel';
            labelledBy = 'parent-trigger';
          } else if (openDropdownId === 'color') {
            id = 'color-panel';
            labelledBy = 'color-trigger';
          }
          return (
            <div className="absolute top-full right-0 left-0 z-40">
              {openDropdownId === 'display' && (
                <DropdownPanelFrame
                  id={id}
                  labelledBy={labelledBy}
                  isOpen={true}
                  className="mx-2 mt-1"
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
              {openDropdownId === 'sort' && (
                <DropdownPanelFrame
                  id={id}
                  labelledBy={labelledBy}
                  isOpen={true}
                  className="mx-2 mt-1"
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
                        ],
                        selectedKey: sortKey,
                        onChange: k =>
                          handleDropdownChange('sort', 'sortBy', k),
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
                        onChange: k =>
                          handleDropdownChange('sort', 'groupBy', k),
                      },
                    ]}
                  />
                </DropdownPanelFrame>
              )}
              {openDropdownId === 'view' && (
                <DropdownPanelFrame
                  id={id}
                  labelledBy={labelledBy}
                  isOpen={true}
                  className="mx-2 mt-1"
                >
                  <DropdownSection label="View">
                    <SingleSelectList
                      options={[
                        { key: 'list', text: 'List', icon: <List size={16} /> },
                        { key: 'grid', text: 'Grid', icon: <Grid size={16} /> },
                      ]}
                      selectedKey={view}
                      onChange={k =>
                        handleDropdownChange('view', 'viewMode', k)
                      }
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
                      onChange={k =>
                        handleDropdownChange('view', 'itemSize', k)
                      }
                    />
                  </DropdownSection>
                </DropdownPanelFrame>
              )}
              {openDropdownId === 'parent' && (
                <DropdownPanelFrame
                  id={id}
                  labelledBy={labelledBy}
                  isOpen={true}
                  className="mx-2 mt-1"
                >
                  <DropdownSection label="Parent Category">
                    <SingleSelectList
                      options={[
                        { key: '__all__', text: 'All Pieces' },
                        ...parentOptions.map(parent => ({
                          key: parent,
                          text: parent,
                        })),
                      ]}
                      selectedKey={filter.parent ?? '__all__'}
                      onChange={k =>
                        handleDropdownChange('parent', 'parent', k)
                      }
                    />
                  </DropdownSection>
                </DropdownPanelFrame>
              )}
              {openDropdownId === 'color' && (
                <DropdownPanelFrame
                  id={id}
                  labelledBy={labelledBy}
                  isOpen={true}
                  className="mx-2 mt-1"
                >
                  <DropdownSection label="Colors">
                    <CheckboxList
                      options={(colorOptions || []).map(c => ({
                        key: c,
                        text: c,
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
          );
        })()}
      </div>

      {/* Large screens: sidebar panels (Parent, Colors only) */}
      <div className="hidden lg:block">
        <div className="flex flex-col gap-2 px-2 py-2">
          {/* (Display/Sort/View moved to top of inventory on desktop) */}

          {parentOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <DropdownTrigger
                id="parent-trigger-lg"
                panelId="parent-panel-lg"
                label={activeDesktopCategory ?? filter.parent ?? 'All Pieces'}
                labelIcon={<FolderTree size={16} />}
                isOpen={openDropdownId === 'parent'}
                onToggle={() => handleDropdownToggle('parent')}
              />
              {openDropdownId === 'parent' && (
                <DropdownPanelFrame
                  id="parent-panel-lg"
                  labelledBy="parent-trigger-lg"
                  isOpen={true}
                  className="mt-1 w-full"
                  hiddenWhenClosed={false}
                >
                  {activeDesktopCategory === null ? (
                    <DropdownSection label="Category">
                      <div>
                        {[
                          { key: '__all__', text: 'All Pieces' },
                          ...parentOptions.map(parent => ({
                            key: parent,
                            text: parent,
                          })),
                        ].map(opt => (
                          <div
                            key={opt.key}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-neutral-100"
                          >
                            <button
                              type="button"
                              className="inline-flex items-center gap-2"
                              onClick={e => {
                                e.stopPropagation();
                                toggleParentCheckbox(opt.key);
                              }}
                            >
                              {(() => {
                                const state =
                                  opt.key === '__all__'
                                    ? 'none'
                                    : getParentState(opt.key);
                                const base =
                                  'inline-flex h-4 w-4 items-center justify-center rounded border border-foreground-accent';
                                if (state === 'all')
                                  return (
                                    <span
                                      className={`${base} bg-blue-600`}
                                    ></span>
                                  );
                                if (state === 'some')
                                  return (
                                    <span className={`${base} bg-blue-50`}>
                                      <span className="h-2 w-2 bg-blue-600"></span>
                                    </span>
                                  );
                                return (
                                  <span
                                    className={`${base} bg-background`}
                                  ></span>
                                );
                              })()}
                              <span>{opt.text}</span>
                            </button>
                            {(() => {
                              if (opt.key === '__all__') return null;
                              const subCount = (
                                subcategoriesByParent[opt.key] || []
                              ).length;
                              if (subCount <= 1) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveDesktopCategory(opt.key)
                                  }
                                  aria-label="Select category"
                                >
                                  <ChevronRight size={16} />
                                </button>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    </DropdownSection>
                  ) : (
                    <>
                      <DropdownSection label="Category">
                        <button
                          type="button"
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:underline"
                          onClick={() => setActiveDesktopCategory(null)}
                        >
                          <ChevronLeft size={16} />
                          <span>{activeDesktopCategory}</span>
                        </button>
                      </DropdownSection>
                      <DropdownSection label="Subcategories">
                        <div>
                          {(
                            subcategoriesByParent[activeDesktopCategory] || []
                          ).map(sub => {
                            const selected = (
                              filter.subcategories || []
                            ).includes(sub);
                            return (
                              <button
                                key={sub}
                                type="button"
                                className={
                                  selected
                                    ? 'flex w-full items-center gap-2 bg-blue-50 px-3 py-2 text-left text-sm text-blue-700 hover:bg-neutral-100'
                                    : 'flex w-full items-center gap-2 bg-background px-3 py-2 text-left text-sm hover:bg-neutral-100'
                                }
                                onClick={() => toggleSubcategoryForActive(sub)}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {}}
                                  className="pointer-events-none"
                                  tabIndex={-1}
                                />
                                <span>{sub}</span>
                              </button>
                            );
                          })}
                        </div>
                      </DropdownSection>
                      {(filter.subcategories?.length || 0) > 0 && (
                        <DropdownSection label="">
                          <div className="px-3 py-2">
                            <button
                              type="button"
                              className="ml-auto inline-flex items-center rounded border border-foreground-accent px-2 py-1 text-xs hover:bg-neutral-100"
                              onClick={onClearSubcategories}
                            >
                              Clear
                            </button>
                          </div>
                        </DropdownSection>
                      )}
                    </>
                  )}
                </DropdownPanelFrame>
              )}
            </div>
          )}

          {colorOptions && colorOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <DropdownTrigger
                id="color-trigger-lg"
                panelId="color-panel-lg"
                label={getColorLabel()}
                labelIcon={<Palette size={16} />}
                isOpen={openDropdownId === 'color'}
                onToggle={() => handleDropdownToggle('color')}
              />
              {openDropdownId === 'color' && (
                <DropdownPanelFrame
                  id="color-panel-lg"
                  labelledBy="color-trigger-lg"
                  isOpen={true}
                  className="mt-1 w-full"
                  hiddenWhenClosed={false}
                >
                  <DropdownSection label="Colors">
                    <CheckboxList
                      options={(colorOptions || []).map(c => ({
                        key: c,
                        text: c,
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
          )}
        </div>
      </div>
    </div>
  );
}
