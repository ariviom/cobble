/**
 * Rebrickable API client and utilities.
 *
 * This module provides the main interface for interacting with the Rebrickable API.
 * It re-exports all public types and functions from the legacy rebrickable.ts file
 * for backwards compatibility, while internally organizing code into smaller modules.
 *
 * Module structure:
 * - types.ts: Shared type definitions
 * - client.ts: HTTP fetch helpers with retry/timeout
 * - (future) search.ts: Set search functionality
 * - (future) inventory.ts: Inventory fetching
 * - (future) parts.ts: Part resolution and lookup
 * - (future) themes.ts: Theme and color data
 */

// Re-export types
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
} from './types';

// Re-export client utilities
export { rbFetch, rbFetchAbsolute, sleep } from './client';

// Re-export all functions from the legacy module
// This maintains backwards compatibility while we incrementally migrate
export {
  getAggregatedSearchResults,
  getColors,
  getPartCategories,
  getPartColorsForPart,
  getPart,
  getSetInventory,
  getSetSummary,
  getSetsForPart,
  getThemes,
  mapBrickLinkColorIdToRebrickableColorId,
  mapCategoryNameToParent,
  normalizeText,
  resolvePartIdToRebrickable,
  searchParts,
  searchSets,
  sortAggregatedResults,
  type SimpleSet,
} from '../rebrickable';


