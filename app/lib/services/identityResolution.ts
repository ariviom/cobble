import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import {
  getColorMaps,
  getRbToBlColorMapFromDb,
} from '@/app/lib/colors/colorMapping';
import {
  createCatalogPartIdentity,
  createMatchedSubpartIdentity,
  createMinifigParentIdentity,
  createUnmatchedSubpartIdentity,
  type PartIdentity,
} from '@/app/lib/domain/partIdentity';

// ---------------------------------------------------------------------------
// Resolution Context — all lookup data needed for identity resolution
// ---------------------------------------------------------------------------

export type ResolutionContext = {
  rbToBlColor: Map<number, number>;
  blToRbColor: Map<number, number>;
  /** RB part ID → BL part ID (from rb_parts.bl_part_id, same-by-default fallback) */
  partMappings: Map<string, string>;
  /** BL part ID → RB part ID (reverse) */
  blToRbPart: Map<string, string>;
};

// ---------------------------------------------------------------------------
// RB → BL color map — re-export for backward compat
// ---------------------------------------------------------------------------

/** @deprecated Use `getColorMaps()` or `getRbToBlColorMapFromDb()` directly. */
export const getRbToBlColorMap = getRbToBlColorMapFromDb;

// ---------------------------------------------------------------------------
// Build resolution context
// ---------------------------------------------------------------------------

/**
 * Build all lookup maps needed for identity resolution.
 * Reads BL part IDs from catalog rows (rb_parts.bl_part_id column).
 * Parts without an explicit BL ID use same-by-default (RB ID = BL ID).
 */
export async function buildResolutionContext(
  catalogRows: InventoryRow[]
): Promise<ResolutionContext> {
  // 1. Color maps (both directions from DB in one call)
  const { rbToBl: rbToBlColor, blToRb: blToRbColor } = await getColorMaps();

  // 2. Part mappings from catalog rows (rb_parts.bl_part_id)
  const partMappings = new Map<string, string>();

  for (const row of catalogRows) {
    if (row.partId.startsWith('fig:')) continue;
    if (row.bricklinkPartId) {
      partMappings.set(row.partId, row.bricklinkPartId);
    }
  }

  // 3. Build reverse part map
  const blToRbPart = new Map<string, string>();
  for (const [rb, bl] of partMappings) {
    blToRbPart.set(bl, rb);
  }

  return { rbToBlColor, blToRbColor, partMappings, blToRbPart };
}

// ---------------------------------------------------------------------------
// Resolve individual identities
// ---------------------------------------------------------------------------

/**
 * Create a PartIdentity for a catalog part row.
 */
export function resolveCatalogPartIdentity(
  row: InventoryRow,
  ctx: ResolutionContext
): PartIdentity {
  // Priority: explicit BL ID from rb_parts.bl_part_id → same-by-default.
  const blPartId =
    row.bricklinkPartId ?? ctx.partMappings.get(row.partId) ?? row.partId;
  const blColorId = ctx.rbToBlColor.get(row.colorId) ?? null;
  const elementId = typeof row.elementId === 'string' ? row.elementId : null;

  return createCatalogPartIdentity(
    row.partId,
    row.colorId,
    blPartId,
    blColorId,
    elementId
  );
}

/**
 * Create a PartIdentity for a BL minifig parent row.
 */
export function resolveMinifigParentIdentity(
  blMinifigId: string,
  rbFigNum?: string | null
): PartIdentity {
  return createMinifigParentIdentity(blMinifigId, rbFigNum);
}

/**
 * Resolve a BL minifig subpart to either a matched (catalog-backed) or
 * unmatched identity.
 *
 * @param blPartId - BrickLink part ID from bl_minifig_parts
 * @param blColorId - BrickLink color ID from bl_minifig_parts
 * @param catalogIndex - Map of canonical keys to row indices in enrichedRows
 * @param ctx - Resolution context with color/part maps
 *
 * @deprecated Use resolveRbMinifigSubpartIdentity for RB-native subpart data
 */
export function resolveMinifigSubpartIdentity(
  blPartId: string,
  blColorId: number,
  catalogIndex: Map<string, number>,
  ctx: ResolutionContext,
  rbColorIdFromDb?: number | null
): PartIdentity {
  // Try to reverse-map BL IDs to RB IDs
  const rbPartId = ctx.blToRbPart.get(blPartId) ?? null;
  const rbColorId = rbColorIdFromDb ?? ctx.blToRbColor.get(blColorId) ?? null;

  if (rbPartId != null && rbColorId != null) {
    // Check if this RB key exists in the catalog index
    const rbKey = `${rbPartId}:${rbColorId}`;
    if (catalogIndex.has(rbKey)) {
      return createMatchedSubpartIdentity(
        rbPartId,
        rbColorId,
        blPartId,
        blColorId
      );
    }
  }

  // Also check if the BL part ID is the same as an RB part ID (common case)
  if (rbColorId != null) {
    const directKey = `${blPartId}:${rbColorId}`;
    if (catalogIndex.has(directKey)) {
      return createMatchedSubpartIdentity(
        blPartId,
        rbColorId,
        blPartId,
        blColorId
      );
    }
  }

  // Check if BL IDs directly match a catalog row (when IDs happen to be the same)
  // This catches cases where the part ID is the same in both systems
  const blKey = `${blPartId}:${blColorId}`;
  if (catalogIndex.has(blKey)) {
    // The catalog uses RB IDs, so if blKey matches, the IDs are the same
    return createMatchedSubpartIdentity(
      blPartId,
      blColorId,
      blPartId,
      blColorId
    );
  }

  // No match found — unmatched subpart
  return createUnmatchedSubpartIdentity(blPartId, blColorId);
}

/**
 * Resolve an RB-native minifig subpart to a matched identity.
 * Used when subparts come from rb_minifig_parts (RB IDs are native).
 * Every subpart is "matched" by definition — rb_minifig_parts has FK refs
 * to rb_parts and rb_colors.
 */
export function resolveRbMinifigSubpartIdentity(
  rbPartId: string,
  rbColorId: number,
  ctx: ResolutionContext,
  /** BL part ID from rb_parts join — preferred over partMappings lookup. */
  knownBlPartId?: string | null
): PartIdentity {
  const blPartId = knownBlPartId ?? ctx.partMappings.get(rbPartId) ?? rbPartId; // same-by-default
  const blColorId = ctx.rbToBlColor.get(rbColorId) ?? null;
  return createMatchedSubpartIdentity(rbPartId, rbColorId, blPartId, blColorId);
}
