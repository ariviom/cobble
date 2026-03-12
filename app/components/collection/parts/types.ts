// app/components/collection/parts/types.ts

export type CollectionPartSetSource = {
  setNumber: string;
  setName: string;
  quantityInSet: number;
  quantityOwned: number;
};

export type CollectionPartMissing = {
  setNumber: string;
  setName: string;
  quantityMissing: number;
  quantityRequired: number;
};

export type CollectionPart = {
  partNum: string;
  colorId: number;
  canonicalKey: string;
  partName: string;
  colorName: string;
  imageUrl: string | null;
  parentCategory: string | null;
  categoryName: string | null;
  elementId: string | null;
  setCount: number | null;
  ownedFromSets: number;
  looseQuantity: number;
  totalOwned: number;
  setSources: CollectionPartSetSource[];
  missingFromSets: CollectionPartMissing[];
};

export type PartsSourceFilter = 'all' | 'owned' | 'loose' | 'missing';

export type PartsSortKey = 'name' | 'color' | 'category' | 'quantity';

export type PartsFilter = {
  source: PartsSourceFilter;
  parents: string[];
  subcategoriesByParent: Record<string, string[]>;
  colors: string[];
};

export type PartsControlsState = {
  filter: PartsFilter;
  sortKey: PartsSortKey;
  sortDir: 'asc' | 'desc';
  groupBy: 'none' | 'color' | 'category';
  view: 'list' | 'grid' | 'micro';
  itemSize: 'sm' | 'md' | 'lg';
  page: number;
  pageSize: number;
};

export type PartSelection = {
  canonicalKey: string;
  quantity: number;
  setNumber?: string; // present for Missing-view selections
};

export const DEFAULT_PARTS_CONTROLS: PartsControlsState = {
  filter: { source: 'all', parents: [], subcategoriesByParent: {}, colors: [] },
  sortKey: 'name',
  sortDir: 'asc',
  groupBy: 'none',
  view: 'grid',
  itemSize: 'md',
  page: 1,
  pageSize: 100,
};
