'use client';

import {
  GroupedDropdown,
  type DropdownGroup,
} from '@/app/components/ui/GroupedDropdown';
import { Filter, FolderTree, Grid, List, SortAsc } from 'lucide-react';
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
  return (
    <div className="sticky top-topnav-height z-30 flex flex-col bg-neutral-50">
      <div className="no-scrollbar flex flex-nowrap items-center gap-2 border-b border-neutral-300 py-2 lg:flex-wrap">
        {/* Display Dropdown: All / Missing / Owned */}
        <GroupedDropdown
          className="ml-2"
          label={
            filter.display === 'owned'
              ? 'Owned'
              : filter.display === 'missing'
                ? 'Missing'
                : 'All'
          }
          labelIcon={<Filter size={16} />}
          groups={
            [
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
            ] satisfies DropdownGroup[]
          }
          onChange={(groupId, key) => {
            if (groupId !== 'display') return;
            if (key === 'all' || key === 'missing' || key === 'owned') {
              onChangeFilter({
                ...filter,
                display: key,
              });
            }
          }}
        />

        {/* Sort Dropdown: Sort By / Order / Group By */}
        <GroupedDropdown
          label="Sort"
          labelIcon={<SortAsc size={16} />}
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
          onChange={(groupId, key) => {
            if (groupId === 'sortBy') onChangeSortKey(key as SortKey);
            else if (groupId === 'order') {
              if (key !== sortDir) onToggleSortDir();
            } else if (groupId === 'groupBy') onChangeGroupBy(key as GroupBy);
          }}
        />

        {/* View Options Dropdown: separate groups for View and Size */}
        <GroupedDropdown
          label={view === 'grid' ? 'Grid' : 'List'}
          labelIcon={view === 'grid' ? <Grid size={16} /> : <List size={16} />}
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
          onChange={(groupId, key) => {
            if (groupId === 'viewMode') {
              onChangeView(key as ViewType);
            } else if (groupId === 'itemSize') {
              onChangeItemSize(key as ItemSize);
            }
          }}
        />

        {parentOptions.length > 0 ? (
          <GroupedDropdown
            className="mr-2 lg:mr-0"
            label={filter.parent ?? 'All Pieces'}
            labelIcon={<FolderTree size={16} />}
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
            onChange={(groupId, key) => {
              if (groupId !== 'parent') return;
              if (key === '__all__') {
                onSelectParent(null);
              } else {
                onSelectParent(key);
              }
            }}
          />
        ) : null}
      </div>

      {filter.parent && subcategoryOptions.length > 1 ? (
        <SubcategoryToggleRail
          options={subcategoryOptions}
          selected={filter.subcategories}
          onToggle={onToggleSubcategory}
        />
      ) : null}
    </div>
  );
}
