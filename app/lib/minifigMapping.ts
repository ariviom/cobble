/**
 * Minifig mapping module - re-exports from the optimized batched implementation.
 *
 * This module maintains backward compatibility while using the new batched
 * implementation that reduces database round-trips from 6-8 calls to 1-2 calls.
 *
 * For new code, prefer importing directly from minifigMappingBatched.ts:
 * - getMinifigMappingsForSetBatched() - batched lookup with sync status
 * - getGlobalMinifigMappingsBatch() - batch global lookups
 */
import 'server-only';

// Re-export everything from the batched module for backward compatibility
export {
  getGlobalMinifigMapping,
  getGlobalMinifigMappingsBatch,
  // Core batched functions (preferred for new code)
  getMinifigMappingsForSetBatched,
  // BL → RB reverse lookup
  mapBrickLinkFigToRebrickable,
  // Legacy aliases (maintained for backward compatibility)
  mapRebrickableFigToBrickLink,
  // On-demand single-fig lookup
  mapRebrickableFigToBrickLinkOnDemand,
  mapSetRebrickableFigsToBrickLink,
  mapSetRebrickableFigsToBrickLinkOnDemand,
  // Utility
  normalizeRebrickableFigId,
  type BatchedMappingOptions,
  // Types
  type MinifigMappingResult,
} from '@/app/lib/minifigMappingBatched';
