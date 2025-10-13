'use client';

import {
  GroupedDropdown,
  type DropdownGroup,
} from '@/app/components/ui/GroupedDropdown';
import { Filter, Grid, List, SortAsc } from 'lucide-react';
import { useRef, useState } from 'react';
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
}: Props) {
  const [menuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex w-full items-center gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Display Dropdown: All / Missing / Owned */}
        <div
          className="flex flex-col items-center gap-2"
          data-dropdown="display"
        >
          <GroupedDropdown
            label={
              filter.kind === 'owned'
                ? 'Owned'
                : filter.kind === 'missing'
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
                  selectedKey:
                    filter.kind === 'category'
                      ? 'all'
                      : (filter.kind as string),
                },
              ] satisfies DropdownGroup[]
            }
            onChange={(groupId, key) => {
              if (groupId !== 'display') return;
              if (key === 'all' || key === 'missing' || key === 'owned') {
                onChangeFilter({ kind: key as 'all' | 'missing' | 'owned' });
              }
            }}
          />
        </div>

        {/* Sort Dropdown: Sort By / Order / Group By */}
        <div
          className="flex flex-col items-center gap-2"
          data-dropdown="arrange"
        >
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
        </div>

        {/* View Options Dropdown: separate groups for View and Size */}
        <div
          className="flex flex-col items-center gap-2"
          data-dropdown="view-options"
        >
          <GroupedDropdown
            label={
              view === 'grid'
                ? itemSize === 'lg'
                  ? 'Large Grid'
                  : itemSize === 'md'
                    ? 'Medium Grid'
                    : 'Small Grid'
                : itemSize === 'lg'
                  ? 'Large List'
                  : itemSize === 'md'
                    ? 'Medium List'
                    : 'Small List'
            }
            labelIcon={
              view === 'grid' ? <Grid size={16} /> : <List size={16} />
            }
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
        </div>
      </div>
      <div className="ml-auto flex flex-col items-center gap-2" ref={menuRef} />
    </div>
  );
}
