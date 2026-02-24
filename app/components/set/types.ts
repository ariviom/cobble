export type ParentRelation = {
  parentKey: string;
  quantity: number;
};

export type ComponentRelation = {
  key: string;
  quantity: number;
};

export type MinifigSubpartStatus =
  | {
      state: 'complete';
      missingCount: 0;
      sharedShortageCount: 0;
    }
  | {
      state: 'missing';
      missingCount: number;
      sharedShortageCount: number;
    }
  | {
      state: 'shared_shortfall';
      missingCount: 0;
      sharedShortageCount: number;
    }
  | {
      state: 'unknown';
      missingCount: 0;
      sharedShortageCount: 0;
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
   * Populated server-side from rb_parts.bl_part_id column.
   * Used for constructing BrickLink URLs and pricing lookups.
   */
  bricklinkPartId?: string | null;
  /**
   * Unified part identity resolving RB↔BL ID differences. Populated
   * server-side at inventory load time. Downstream consumers should prefer
   * identity fields over ad-hoc key derivation.
   */
  identity?: import('@/app/lib/domain/partIdentity').PartIdentity;
  /**
   * Number of distinct sets this part+color appears in (precomputed).
   * For minifig parent rows, this is min_subpart_set_count — the set_count
   * of the rarest subpart, reflecting sourcing difficulty.
   */
  setCount?: number | null;
};

export type RarityTier = 'exclusive' | 'very_rare' | 'rare';

export function getRarityTier(
  setCount: number | null | undefined
): RarityTier | null {
  if (setCount == null) return null;
  if (setCount === 1) return 'exclusive';
  if (setCount <= 3) return 'very_rare';
  if (setCount <= 10) return 'rare';
  return null;
}

export type SortKey =
  | 'name'
  | 'color'
  | 'size'
  | 'category'
  | 'price'
  | 'rarity'
  | 'quantity';

export type ViewType = 'list' | 'grid';

export type ItemSize = 'sm' | 'md' | 'lg';

export type InventoryFilter = {
  display: 'all' | 'missing' | 'owned';
  parents: string[]; // selected parent categories; empty means all parents
  // if a parent key is missing, that means "all subcategories" for that parent are included
  subcategoriesByParent: Record<string, string[]>;
  colors: string[];
  rarityTiers?: RarityTier[] | undefined; // empty or undefined = no filter
};

export type GroupBy = 'none' | 'color' | 'size' | 'category' | 'rarity';
