import 'server-only';

import {
  extractCandidatePartNumbers,
  identifyWithBrickognize,
} from '@/app/lib/brickognize';
import { logger } from '@/lib/metrics';

import { PipelineBudget } from './budget';
import {
  resolveIdentifyResult,
  type IdentifyResolved,
} from './stages/findSets';
import { resolveCandidates } from './stages/resolve';

export type IdentifyInput = {
  image: Blob;
  colorHint?: number | undefined;
};

export type PipelineResult =
  | IdentifyResolved
  | { status: 'no_match' }
  | { status: 'no_valid_candidate' };

/**
 * Three-stage identify pipeline:
 *   recognize (Brickognize) → resolve (RB) → findSets (RB + BL fallback)
 */
export async function runIdentifyPipeline(
  input: IdentifyInput,
  budget: PipelineBudget
): Promise<PipelineResult> {
  // Stage 1: Recognize
  const brickognizePayload = await identifyWithBrickognize(input.image);
  if (process.env.NODE_ENV !== 'production') {
    const payloadDiag = brickognizePayload as {
      listing_id?: unknown;
      items?: unknown[];
    };
    logger.debug('identify.brickognize_payload', {
      listing_id: payloadDiag.listing_id,
      items_len: Array.isArray(payloadDiag.items)
        ? payloadDiag.items.length
        : undefined,
    });
  }

  const candidates = extractCandidatePartNumbers(brickognizePayload).sort(
    (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
  );
  logger.debug('identify.candidates_extracted', {
    count: candidates.length,
    sample: candidates.slice(0, 3),
  });
  if (!candidates.length) return { status: 'no_match' };

  // Stage 2: Resolve
  const resolved = await resolveCandidates(candidates);
  logger.debug('identify.candidates_resolved', {
    count: resolved.length,
    sample: resolved.slice(0, 3).map(c => ({
      partNum: c.partNum,
      bricklinkId: c.bricklinkId,
      confidence: c.confidence,
      colorId: c.colorId,
    })),
  });
  if (!resolved.length) return { status: 'no_valid_candidate' };

  // Stage 3: Find sets
  return resolveIdentifyResult({
    candidates: resolved,
    ...(input.colorHint !== undefined ? { colorHint: input.colorHint } : {}),
    budget,
  });
}
