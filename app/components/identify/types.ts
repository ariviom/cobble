export type IdentifyPart = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  confidence: number;
  colorId: number | null;
  colorName: string | null;
  /**
   * Authoritative BrickLink part ID from catalog (rb_parts.bl_part_id).
   * Falls back to partNum when not available.
   */
  bricklinkPartId?: string | null;
  /**
   * True when this Identify entry represents a minifigure rather than a part.
   */
  isMinifig?: boolean;
  /**
   * Rebrickable minifig ID (e.g. "fig-007") when applicable.
   */
  rebrickableFigId?: string | null;
  /**
   * BrickLink minifig ID (e.g. "cas432") when available.
   */
  bricklinkFigId?: string | null;
};

export type IdentifyCandidate = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  confidence: number;
  colorId?: number;
  colorName?: string;
};

export type IdentifySet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  quantity: number;
  numParts?: number | null;
  themeId?: number | null;
  themeName?: string | null;
};

export type IdentifyResponse = {
  part: IdentifyPart;
  candidates: IdentifyCandidate[];
  sets: IdentifySet[];
  availableColors?: Array<{ id: number; name: string }>;
  // When falling back to BrickLink supersets for assemblies (no component list)
  blPartId?: string;
  blAvailableColors?: Array<{ id: number; name: string }>;
  selectedColorId?: number | null;
  /** Rarest subpart set count for minifigs (from rb_minifig_rarity). */
  rarestSubpartSetCount?: number | null;
  /** Sets that the rarest subpart appears in (excluding the minifig's own direct sets). */
  rarestSubpartSets?: IdentifySet[];
};
