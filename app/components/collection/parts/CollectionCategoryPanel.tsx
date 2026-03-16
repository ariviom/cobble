'use client';

import { CategoryFilterPanel } from '@/app/components/ui/CategoryFilterPanel';
import type { PartsFilter } from './types';

type Props = {
  filter: PartsFilter;
  onFilterChange: (f: PartsFilter) => void;
  parentOptions: string[];
  subcategoriesByParent: Record<string, string[]>;
};

export function CollectionCategoryPanel({
  filter,
  onFilterChange,
  parentOptions,
  subcategoriesByParent,
}: Props) {
  return (
    <CategoryFilterPanel
      filter={filter}
      onFilterChange={onFilterChange}
      parentOptions={parentOptions}
      subcategoriesByParent={subcategoriesByParent}
      subRowClassName="border-b border-foreground-accent"
    />
  );
}
