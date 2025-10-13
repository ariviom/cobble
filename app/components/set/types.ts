export type InventoryRow = {
  setNumber: string;
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  quantityRequired: number;
  imageUrl: string | null;
  partCategoryId?: number;
  partCategoryName?: string;
  parentCategory?: string;
};

export type SortKey = 'name' | 'color' | 'size';

export type ViewType = 'list' | 'grid';

export type ItemSize = 'sm' | 'md' | 'lg';

export type InventoryFilter =
  | { kind: 'all' }
  | { kind: 'missing' }
  | { kind: 'owned' }
  | { kind: 'parent'; parent: string }
  | { kind: 'category'; category: string };

export type GroupBy = 'none' | 'color' | 'size' | 'category';
