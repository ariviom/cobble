'use client';

import { CategoryFilterPanel } from '@/app/components/ui/CategoryFilterPanel';
import type { InventoryFilter } from '../types';

type Props = {
  filter: InventoryFilter;
  onChangeFilter: (f: InventoryFilter) => void;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
  parentCounts?: Record<string, number>;
};

export function SidebarCategoryPanel({
  filter,
  onChangeFilter,
  parentOptions,
  subcategoriesByParent,
  parentCounts,
}: Props) {
  return (
    <CategoryFilterPanel
      filter={filter}
      onFilterChange={onChangeFilter}
      parentOptions={parentOptions}
      subcategoriesByParent={subcategoriesByParent}
      parentCounts={parentCounts}
      showSubChevron
      clearAllClassName="border-b-2"
      subClearAllClassName="border-b-2"
    />
  );
}
