'use client';

import {
  DropdownPanel,
  DropdownTrigger,
} from '@/app/components/ui/GroupedDropdown';
import type { DropdownGroup } from '@/app/components/ui/GroupedDropdown';
import { Filter, FolderTree, Grid, List, SortAsc } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SubcategoryToggleRail } from './SubcategoryToggleRail';
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
  onToggleSubcategory: (subcategory: string) => void;
  onClearSubcategories: () => void;
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
  onToggleSubcategory,
  onClearSubcategories,
}: Props) {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={containerRef}
      className="sticky top-topnav-height z-30 flex flex-col bg-neutral-50 lg:w-80 lg:shrink-0 lg:border-r lg:border-neutral-300"
    >
      {/* Mobile: horizontally scrollable control rail with overlay panel below it */}
      <div className="relative lg:hidden">
        <div className="no-scrollbar flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-neutral-300 py-2 px-2">
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
            labelIcon={view === 'grid' ? <Grid size={16} /> : <List size={16} />}
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
        </div>

        {/* Overlay panel positioned directly below the control rail */}
        {(() => {
          if (!openDropdownId) return null;
          let id = '';
          let labelledBy = '';
          let groups: DropdownGroup[] = [];
          if (openDropdownId === 'display') {
            id = 'display-panel';
            labelledBy = 'display-trigger';
            groups = [
              {
                id: 'display',
                label: 'Filter By',
                options: [
                  { key: 'all', text: 'All' },
                  { key: 'missing', text: 'Missing' },
                  { key: 'owned', text: 'Owned' },
                ],
                selectedKey: filter.display,
              },
            ];
          } else if (openDropdownId === 'sort') {
            id = 'sort-panel';
            labelledBy = 'sort-trigger';
            groups = [
              {
                id: 'sortBy',
                label: 'Sort By',
                options: [
                  { key: 'name', text: 'Name' },
                  { key: 'color', text: 'Color' },
                  { key: 'size', text: 'Size' },
                ],
                selectedKey: sortKey,
              },
              {
                id: 'order',
                label: 'Order',
                options: [
                  { key: 'asc', text: 'Ascending' },
                  { key: 'desc', text: 'Descending' },
                ],
                selectedKey: sortDir,
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
              },
            ];
          } else if (openDropdownId === 'view') {
            id = 'view-panel';
            labelledBy = 'view-trigger';
            groups = [
              {
                id: 'viewMode',
                label: 'View',
                options: [
                  { key: 'list', text: 'List', icon: <List size={16} /> },
                  { key: 'grid', text: 'Grid', icon: <Grid size={16} /> },
                ],
                selectedKey: view,
              },
              {
                id: 'itemSize',
                label: 'Size',
                options: [
                  { key: 'lg', text: 'Large' },
                  { key: 'md', text: 'Medium' },
                  { key: 'sm', text: 'Small' },
                ],
                selectedKey: itemSize,
              },
            ];
          } else if (openDropdownId === 'parent') {
            id = 'parent-panel';
            labelledBy = 'parent-trigger';
            groups = [
              {
                id: 'parent',
                label: 'Parent Category',
                options: [
                  { key: '__all__', text: 'All Pieces' },
                  ...parentOptions.map(parent => ({ key: parent, text: parent })),
                ],
                selectedKey: filter.parent ?? '__all__',
              },
            ];
          }
          return (
            <div className="absolute left-0 right-0 top-full z-40">
              <DropdownPanel
                id={id}
                labelledBy={labelledBy}
                isOpen={true}
                groups={groups}
                onChange={(groupId, key) =>
                  handleDropdownChange(openDropdownId, groupId, key)
                }
                className="mx-2 mt-1"
              />
            </div>
          );
        })()}
      </div>

      {/* Large screens: individual panels directly under each trigger */}
      <div className="hidden lg:block">
        <div className="flex flex-col gap-2 px-2 py-2">
          <div className="flex flex-col gap-1">
            <DropdownTrigger
              id="display-trigger-lg"
              panelId="display-panel-lg"
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
              <DropdownPanel
                id="display-panel-lg"
                labelledBy="display-trigger-lg"
                isOpen={true}
                groups={[
                  {
                    id: 'display',
                    label: 'Filter By',
                    options: [
                      { key: 'all', text: 'All' },
                      { key: 'missing', text: 'Missing' },
                      { key: 'owned', text: 'Owned' },
                    ],
                    selectedKey: filter.display,
                  },
                ]}
                onChange={(groupId, key) =>
                  handleDropdownChange('display', groupId, key)
                }
                className="w-full mt-1"
                hiddenWhenClosed={false}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <DropdownTrigger
              id="sort-trigger-lg"
              panelId="sort-panel-lg"
              label="Sort"
              labelIcon={<SortAsc size={16} />}
              isOpen={openDropdownId === 'sort'}
              onToggle={() => handleDropdownToggle('sort')}
            />
            {openDropdownId === 'sort' && (
              <DropdownPanel
                id="sort-panel-lg"
                labelledBy="sort-trigger-lg"
                isOpen={true}
                groups={[
                  {
                    id: 'sortBy',
                    label: 'Sort By',
                    options: [
                      { key: 'name', text: 'Name' },
                      { key: 'color', text: 'Color' },
                      { key: 'size', text: 'Size' },
                    ],
                    selectedKey: sortKey,
                  },
                  {
                    id: 'order',
                    label: 'Order',
                    options: [
                      { key: 'asc', text: 'Ascending' },
                      { key: 'desc', text: 'Descending' },
                    ],
                    selectedKey: sortDir,
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
                  },
                ]}
                onChange={(groupId, key) =>
                  handleDropdownChange('sort', groupId, key)
                }
                className="w-full mt-1"
                hiddenWhenClosed={false}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <DropdownTrigger
              id="view-trigger-lg"
              panelId="view-panel-lg"
              label={view === 'grid' ? 'Grid' : 'List'}
              labelIcon={
                view === 'grid' ? <Grid size={16} /> : <List size={16} />
              }
              isOpen={openDropdownId === 'view'}
              onToggle={() => handleDropdownToggle('view')}
            />
            {openDropdownId === 'view' && (
              <DropdownPanel
                id="view-panel-lg"
                labelledBy="view-trigger-lg"
                isOpen={true}
                groups={[
                  {
                    id: 'viewMode',
                    label: 'View',
                    options: [
                      { key: 'list', text: 'List', icon: <List size={16} /> },
                      { key: 'grid', text: 'Grid', icon: <Grid size={16} /> },
                    ],
                    selectedKey: view,
                  },
                  {
                    id: 'itemSize',
                    label: 'Size',
                    options: [
                      { key: 'lg', text: 'Large' },
                      { key: 'md', text: 'Medium' },
                      { key: 'sm', text: 'Small' },
                    ],
                    selectedKey: itemSize,
                  },
                ]}
                onChange={(groupId, key) =>
                  handleDropdownChange('view', groupId, key)
                }
                className="w-full mt-1"
                hiddenWhenClosed={false}
              />
            )}
          </div>

          {parentOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <DropdownTrigger
                id="parent-trigger-lg"
                panelId="parent-panel-lg"
                label={filter.parent ?? 'All Pieces'}
                labelIcon={<FolderTree size={16} />}
                isOpen={openDropdownId === 'parent'}
                onToggle={() => handleDropdownToggle('parent')}
              />
              {openDropdownId === 'parent' && (
                <DropdownPanel
                  id="parent-panel-lg"
                  labelledBy="parent-trigger-lg"
                  isOpen={true}
                  groups={[
                    {
                      id: 'parent',
                      label: 'Parent Category',
                      options: [
                        { key: '__all__', text: 'All Pieces' },
                        ...parentOptions.map(parent => ({
                          key: parent,
                          text: parent,
                        })),
                      ],
                      selectedKey: filter.parent ?? '__all__',
                    },
                  ]}
                  onChange={(groupId, key) =>
                    handleDropdownChange('parent', groupId, key)
                  }
                  className="w-full mt-1"
                  hiddenWhenClosed={false}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
