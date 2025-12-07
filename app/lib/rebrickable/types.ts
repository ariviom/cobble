/**
 * Shared types for Rebrickable API responses and domain models.
 */

/** Rebrickable set search result shape from the API */
export type RebrickableSetSearchResult = {
  set_num: string;
  name: string;
  year: number;
  num_parts: number;
  set_img_url: string | null;
  theme_id?: number;
};

/** Rebrickable set inventory item shape from the API */
export type RebrickableSetInventoryItem = {
  color: { id: number; name: string };
  part: {
    part_num: string;
    name: string;
    part_img_url: string | null;
    part_cat_id?: number;
    /** External IDs from other databases (BrickLink, BrickOwl, etc.) when inc_part_details=1 */
    external_ids?: Record<string, unknown>;
  };
  element_id?: string | null;
  quantity: number;
  is_spare: boolean;
};

/** Rebrickable minifig item shape (varies by endpoint) */
export type RebrickableSetMinifigItem = {
  fig_num?: string;
  set_num?: string;
  set_name?: string;
  name?: string;
  quantity: number;
  set_img_url?: string | null;
  minifig?: {
    fig_num?: string;
    set_num?: string;
    name?: string;
    set_img_url?: string | null;
  };
};

/** Rebrickable minifig component shape */
export type RebrickableMinifigComponent = {
  part: {
    part_num: string;
    name?: string;
    part_img_url?: string | null;
    part_cat_id?: number;
    /** External IDs from other databases (BrickLink, BrickOwl, etc.) when inc_part_details=1 */
    external_ids?: Record<string, unknown>;
  };
  color?: {
    id: number;
    name: string;
  };
  quantity: number;
};

/** Parent category for grouping parts */
export type ParentCategory =
  | 'Brick'
  | 'Plate'
  | 'Tile'
  | 'Slope'
  | 'Clip'
  | 'Hinge'
  | 'Bar'
  | 'Minifigure'
  | 'Technic'
  | 'Wheels'
  | 'Misc';

/** Domain model for a row in a set inventory */
export type InventoryRow = {
  setNumber: string;
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  quantityRequired: number;
  imageUrl: string | null;
  elementId?: string | null;
  partCategoryId?: number;
  partCategoryName?: string;
  parentCategory?: ParentCategory;
  inventoryKey: string;
  parentRelations?: Array<{ parentKey: string; quantity: number }>;
  componentRelations?: Array<{ key: string; quantity: number }>;
};

/** Rebrickable part category */
export type RebrickableCategory = {
  id: number;
  name: string;
};

/** Rebrickable part details */
export type RebrickablePart = {
  part_num: string;
  name: string;
  part_cat_id?: number;
  part_img_url: string | null;
  print_of?: string | null;
  external_ids?: Record<string, unknown>;
};

/** Rebrickable theme */
export type RebrickableTheme = {
  id: number;
  parent_id: number | null;
  name: string;
};

/** Rebrickable color with external ID mappings */
export type RebrickableColor = {
  id: number;
  name: string;
  rgb: string | null;
  is_trans: boolean;
  external_ids?: {
    BrickLink?: {
      ext_ids: number[];
      ext_descrs: string[][];
    };
    [key: string]: unknown;
  };
};

/** Resolved part information */
export type ResolvedPart = {
  partNum: string;
  name: string;
  imageUrl: string | null;
};

/** Available color for a part */
export type PartAvailableColor = {
  id: number;
  name: string;
  rgb: string | null;
  isTrans: boolean;
  numSets: number;
  numSetParts: number;
};

/** Set containing a specific part */
export type PartInSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  /**
   * How many times the specific part appears in the set.
   */
  quantity: number;
  /**
   * Total parts in the set (identical to set search cards). Optional because
   * Rebrickable set-part endpoints do not return it directly.
   */
  numParts?: number | null;
  /**
   * Theme metadata for parity with regular set search results.
   */
  themeId?: number | null;
  themeName?: string | null;
};




