export type InventoryRow = {
  setNumber: string;
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  quantityRequired: number;
  imageUrl: string | null;
};

export type SortKey =
  | 'name'
  | 'color'
  | 'required'
  | 'owned'
  | 'missing'
  | 'size';

export type ViewType = 'list' | 'grid';

export type ItemSize = 'sm' | 'md' | 'lg';
