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

export type SortKey = 'name' | 'color' | 'size' | 'category';

export type ViewType = 'list' | 'grid';

export type ItemSize = 'sm' | 'md' | 'lg';

export type InventoryFilter = {
  display: 'all' | 'missing' | 'owned';
  parents: string[]; // selected parent categories; empty means all parents
  // if a parent key is missing, that means "all subcategories" for that parent are included
  subcategoriesByParent: Record<string, string[]>;
  colors: string[];
};

export type GroupBy = 'none' | 'color' | 'size' | 'category';
