import 'server-only';

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
  bricklinkId?: string;
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
          isBricklinkOnly: true,
        };
      }
      return null;
    })
  );
  return resolved.filter(Boolean) as ResolvedCandidate[];
}
