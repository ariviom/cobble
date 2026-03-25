import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { getColorMaps } from '@/app/lib/colors/colorMapping';
import {
  createCatalogPartIdentity,
  createMatchedSubpartIdentity,
  createMinifigParentIdentity,
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
