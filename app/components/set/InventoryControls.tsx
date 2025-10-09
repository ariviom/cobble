'use client';

import { Button } from '@/app/components/ui/Button';
import { Checkbox } from '@/app/components/ui/Checkbox';
import { Select } from '@/app/components/ui/Select';
import type { ItemSize, SortKey, ViewType } from './types';

type Props = {
  view: ViewType;
  onChangeView: (v: ViewType) => void;
  itemSize: ItemSize;
  onChangeItemSize: (s: ItemSize) => void;
  sortKey: SortKey;
  onChangeSortKey: (k: SortKey) => void;
  sortDir: 'asc' | 'desc';
  onToggleSortDir: () => void;
  groupByCategory: boolean;
  onChangeGroupByCategory: (v: boolean) => void;
  onMarkAllOwned: () => void;
  onClearAllOwned: () => void;
  totalMissing: number;
  onOpenExport: () => void;
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
  groupByCategory,
  onChangeGroupByCategory,
  onMarkAllOwned,
  onClearAllOwned,
  totalMissing,
  onOpenExport,
}: Props) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Button onClick={onMarkAllOwned}>All owned</Button>
      <Button onClick={onClearAllOwned}>None owned</Button>
      <Button variant="primary" onClick={onOpenExport}>
        Export
      </Button>
      <div className="hidden items-center gap-2 md:flex">
        <div className="ml-2">
          <label className="mr-1 text-xs">View</label>
          <Select
            value={view}
            onChange={e => onChangeView(e.target.value as ViewType)}
          >
            <option value="list">List</option>
            <option value="grid">Grid</option>
          </Select>
        </div>
        <div>
          <label className="mr-1 text-xs">Size</label>
          <Select
            value={itemSize}
            onChange={e => onChangeItemSize(e.target.value as ItemSize)}
          >
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </Select>
        </div>
        <div>
          <label className="mr-1 text-xs">Sort</label>
          <Select
            value={sortKey}
            onChange={e => onChangeSortKey(e.target.value as SortKey)}
          >
            <option value="color">Color</option>
            <option value="name">Name</option>
            <option value="required">Required</option>
            <option value="owned">Owned</option>
            <option value="missing">Missing</option>
            <option value="size">Size</option>
          </Select>
        </div>
        <Button onClick={onToggleSortDir}>
          {sortDir === 'asc' ? 'Asc' : 'Desc'}
        </Button>
        <label className="ml-1 flex items-center gap-1 text-sm">
          <Checkbox
            checked={groupByCategory}
            onChange={e => onChangeGroupByCategory(e.target.checked)}
          />
          Group by category
        </label>
      </div>
      <div className="ml-auto text-sm text-gray-700">
        Total missing: {totalMissing}
      </div>
    </div>
  );
}
