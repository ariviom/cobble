/**
 * Rebrickable API client and utilities.
 *
 * This module re-exports the public surface from the refactored submodules to
 * keep existing import paths stable.
 */

// Types
export type {
  InventoryRow,
  ParentCategory,
  PartAvailableColor,
  PartInSet,
  RebrickableCategory,
  RebrickableColor,
  RebrickableMinifigComponent,
  RebrickablePart,
  RebrickableSetInventoryItem,
  RebrickableSetMinifigItem,
  RebrickableSetSearchResult,
  RebrickableTheme,
  ResolvedPart,
  SimpleSet,
} from './types';

// Client utilities
export {
  isRebrickableCircuitOpen,
  rbFetch,
  rbFetchAbsolute,
  sleep,
} from './client';

// Search
export {
  getAggregatedSearchResults,
  searchSets,
  sortAggregatedResults,
} from './search';

// Inventory
export { getSetInventory, getSetSummary } from './inventory';

// Parts
export {
  getPart,
  getPartCategories,
  getPartColorsForPart,
  getSetsForPart,
  resolvePartIdToRebrickable,
  searchParts,
} from './parts';

// Minifigs
export {
  getMinifigPartsCached,
  getSetsForMinifig,
  searchMinifigs,
} from './minifigs';

// Themes & colors
export { getColors, mapBrickLinkColorIdToRebrickableColorId } from './colors';
export { getThemes } from './themes';

// Utilities
export { mapCategoryNameToParent, normalizeText } from './utils';
