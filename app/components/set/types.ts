export type ParentRelation = {
  parentKey: string;
  quantity: number;
};

export type ComponentRelation = {
  key: string;
  quantity: number;
};

export type InventoryRow = {
  setNumber: string;
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  quantityRequired: number;
  imageUrl: string | null;
  /**
   * LEGO element ID for this exact part+color combination when available.
   * Sourced from Rebrickable set inventory (`element_id`) and used for
   * LEGO Pick-a-Brick CSV export.
   */
  elementId?: string | null;
  partCategoryId?: number;
  partCategoryName?: string;
  parentCategory?: string;
  inventoryKey: string;
  parentRelations?: ParentRelation[];
  componentRelations?: ComponentRelation[];
  /**
   * Canonical BrickLink minifigure ID (e.g., "cas432") when available for
   * minifigure parent rows whose partId starts with "fig:". Populated on the
   * server via Supabase-backed mappings and used for linking/pricing.
   */
  bricklinkFigId?: string | null;
  /**
   * Canonical BrickLink part ID when different from the Rebrickable partId.
   * Populated server-side from Rebrickable's external_ids.BrickLink field.
   * Used for constructing BrickLink URLs and pricing lookups.
   */
  bricklinkPartId?: string | null;
};

export type SortKey = 'name' | 'color' | 'size' | 'category' | 'price';

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
