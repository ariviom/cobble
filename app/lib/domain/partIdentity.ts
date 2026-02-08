/**
 * Unified Part Identity
 *
 * Resolves Rebrickable and BrickLink ID system differences into a single
 * canonical identity object. Created server-side once at inventory load time
 * and consumed by all downstream code (client dedup, exports, pricing).
 */

export type PartIdentityRowType =
  | 'catalog_part'
  | 'minifig_parent'
  | 'minifig_subpart_matched'
  | 'minifig_subpart_unmatched';

export type PartIdentity = {
  /** Deterministic dedup/persistence key */
  canonicalKey: string;
  rbPartId: string;
  rbColorId: number;
  blPartId: string | null;
  blColorId: number | null;
  elementId: string | null;
  rowType: PartIdentityRowType;
  blMinifigId: string | null;
};

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createCatalogPartIdentity(
  rbPartId: string,
  rbColorId: number,
  blPartId: string | null,
  blColorId: number | null,
  elementId: string | null
): PartIdentity {
  return {
    canonicalKey: `${rbPartId}:${rbColorId}`,
    rbPartId,
    rbColorId,
    blPartId,
    blColorId,
    elementId,
    rowType: 'catalog_part',
    blMinifigId: null,
  };
}

export function createMinifigParentIdentity(blMinifigId: string): PartIdentity {
  return {
    canonicalKey: `fig:${blMinifigId}`,
    rbPartId: `fig:${blMinifigId}`,
    rbColorId: 0,
    blPartId: null,
    blColorId: null,
    elementId: null,
    rowType: 'minifig_parent',
    blMinifigId,
  };
}

export function createMatchedSubpartIdentity(
  rbPartId: string,
  rbColorId: number,
  blPartId: string | null,
  blColorId: number | null
): PartIdentity {
  return {
    canonicalKey: `${rbPartId}:${rbColorId}`,
    rbPartId,
    rbColorId,
    blPartId,
    blColorId,
    elementId: null,
    rowType: 'minifig_subpart_matched',
    blMinifigId: null,
  };
}

export function createUnmatchedSubpartIdentity(
  blPartId: string,
  blColorId: number
): PartIdentity {
  return {
    canonicalKey: `bl:${blPartId}:${blColorId}`,
    rbPartId: blPartId,
    rbColorId: blColorId,
    blPartId,
    blColorId,
    elementId: null,
    rowType: 'minifig_subpart_unmatched',
    blMinifigId: null,
  };
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Returns all possible keys this row's owned data could live under.
 * Used for migration from legacy BL-keyed storage to canonical keys.
 */
export function getLegacyKeys(identity: PartIdentity): string[] {
  const keys = new Set<string>();
  keys.add(identity.canonicalKey);

  switch (identity.rowType) {
    case 'minifig_subpart_matched':
      // Previously stored under BL key: `{blPartId}:{blColorId}`
      if (identity.blPartId != null && identity.blColorId != null) {
        keys.add(`${identity.blPartId}:${identity.blColorId}`);
      }
      // Also could be under RB key (already canonical)
      keys.add(`${identity.rbPartId}:${identity.rbColorId}`);
      break;

    case 'minifig_subpart_unmatched':
      // Previously stored under BL key without prefix: `{blPartId}:{blColorId}`
      if (identity.blPartId != null && identity.blColorId != null) {
        keys.add(`${identity.blPartId}:${identity.blColorId}`);
      }
      break;

    case 'catalog_part':
      // Could have BL key if bricklinkPartId was used
      if (identity.blPartId != null && identity.blColorId != null) {
        keys.add(`${identity.blPartId}:${identity.blColorId}`);
      }
      break;

    case 'minifig_parent':
      // Stable key format: `fig:{blMinifigId}`
      break;
  }

  return Array.from(keys);
}

/**
 * Parse a canonical key back into its components.
 */
export function parseCanonicalKey(
  key: string
): { partNum: string; colorId: number; system: 'rb' | 'bl' | 'fig' } | null {
  // Minifig parent: fig:{blMinifigId}
  if (key.startsWith('fig:')) {
    const figId = key.slice(4);
    if (!figId) return null;
    return { partNum: figId, colorId: 0, system: 'fig' };
  }

  // Unmatched BL subpart: bl:{blPartId}:{blColorId}
  if (key.startsWith('bl:')) {
    const rest = key.slice(3);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon === -1) return null;
    const partNum = rest.slice(0, lastColon);
    const colorId = Number(rest.slice(lastColon + 1));
    if (!partNum || !Number.isFinite(colorId)) return null;
    return { partNum, colorId, system: 'bl' };
  }

  // Standard RB part: {rbPartId}:{rbColorId}
  const lastColon = key.lastIndexOf(':');
  if (lastColon === -1) return null;
  const partNum = key.slice(0, lastColon);
  const colorId = Number(key.slice(lastColon + 1));
  if (!partNum || !Number.isFinite(colorId)) return null;
  return { partNum, colorId, system: 'rb' };
}
