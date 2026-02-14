import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { resolvePartIdToRebrickable } from '@/app/lib/rebrickable';

export type IdentifyCandidate = {
  partNum: string;
  bricklinkId?: string;
  confidence?: number;
  colorId?: number;
  colorName?: string;
  imageUrl?: string;
};

export type ResolvedCandidate = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  confidence: number;
  colorId?: number;
  colorName?: string;
  /** BrickLink part ID from Brickognize (may be inaccurate). */
  bricklinkId?: string;
  /** Authoritative BrickLink part ID from rb_parts.bl_part_id catalog. */
  bricklinkPartId?: string | null;
  /**
   * True when we could not resolve to Rebrickable but have a BrickLink ID; skip RB lookups.
   */
  isBricklinkOnly?: boolean;
};

export async function resolveCandidates(
  raw: IdentifyCandidate[]
): Promise<ResolvedCandidate[]> {
  const resolved = await Promise.all(
    raw.map(async candidate => {
      const blId =
        typeof candidate.bricklinkId === 'string'
          ? candidate.bricklinkId
          : undefined;
      const base = await resolvePartIdToRebrickable(
        candidate.partNum,
        blId ? { bricklinkId: blId } : undefined
      );
      const resolvedPart =
        base ?? (await resolvePartIdToRebrickable(candidate.partNum));
      if (resolvedPart) {
        return {
          partNum: resolvedPart.partNum,
          name: resolvedPart.name,
          imageUrl: resolvedPart.imageUrl,
          confidence: candidate.confidence ?? 0,
          colorId: candidate.colorId,
          colorName: candidate.colorName,
          bricklinkId: blId,
          isBricklinkOnly: false,
        };
      }
      // If we could not resolve to Rebrickable but have a BL ID, return a BL-only candidate for fallback.
      if (blId) {
        return {
          partNum: candidate.partNum,
          name: candidate.partNum, // fallback to part number; BL fallback will enrich name/image
          imageUrl: candidate.imageUrl ?? null,
          confidence: candidate.confidence ?? 0,
          colorId: candidate.colorId,
          colorName: candidate.colorName,
          bricklinkId: blId,
          bricklinkPartId: blId,
          isBricklinkOnly: true,
        };
      }
      return null;
    })
  );

  const candidates = resolved.filter(Boolean) as ResolvedCandidate[];

  // Batch-lookup authoritative BL part IDs from catalog
  const rbPartNums = candidates
    .filter(c => !c.isBricklinkOnly)
    .map(c => c.partNum);
  if (rbPartNums.length > 0) {
    try {
      const supabase = getCatalogReadClient();
      const { data } = await supabase
        .from('rb_parts')
        .select('part_num, bl_part_id')
        .in('part_num', rbPartNums);
      if (data) {
        const blMap = new Map(
          data.map(r => [r.part_num, r.bl_part_id] as const)
        );
        for (const c of candidates) {
          if (!c.isBricklinkOnly) {
            c.bricklinkPartId = blMap.get(c.partNum) ?? null;
          }
        }
      }
    } catch {
      // tolerate catalog lookup failures — BL links will use RB ID as fallback
    }
  }

  return candidates;
}
