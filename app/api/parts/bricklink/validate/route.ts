import { errorResponse } from '@/app/lib/api/responses';
import { blValidatePart } from '@/app/lib/bricklink';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { incrementCounter, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

const PART_SUFFIX_PATTERN = /^(\d+)[a-z]$/i;
const RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
const RATE_LIMIT_PER_MINUTE =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;

async function persistMapping(
  rbPartId: string,
  blPartId: string,
  source: string
): Promise<void> {
  try {
    const supabase = getCatalogWriteClient();
    const { error } = await supabase.from('part_id_mappings').upsert(
      {
        rb_part_id: rbPartId,
        bl_part_id: blPartId,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rb_part_id' }
    );
    if (error) {
      logger.error('parts.bricklink.validate.persist_failed', {
        rbPartId,
        blPartId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.error('parts.bricklink.validate.persist_error', {
      rbPartId,
      blPartId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * On-demand validation: given a stored BL part ID (and optionally the RB part ID),
 * validate that the BL part exists. If not, try fallback candidates and return
 * the first valid one (self-healing the mapping).
 *
 * Query params:
 *   blPartId - the stored BrickLink part ID to validate
 *   rbPartId - (optional) Rebrickable part ID for fallback candidates
 *
 * Response:
 *   { validBlPartId: string | null, corrected: boolean }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blPartId = searchParams.get('blPartId')?.trim();
  const rbPartId = searchParams.get('rbPartId')?.trim();

  if (!blPartId) {
    return errorResponse('missing_required_field', {
      message: 'blPartId is required',
    });
  }

  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`ip:bl-validate:${clientIp}`, {
    windowMs: RATE_WINDOW_MS,
    maxHits: RATE_LIMIT_PER_MINUTE,
  });
  if (!ipLimit.allowed) {
    incrementCounter('parts_bricklink_validate_rate_limited');
    return errorResponse('rate_limited', {
      status: 429,
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  try {
    // 1. Check the stored BL part ID
    const storedResult = await blValidatePart(blPartId);
    if (storedResult === 'exists') {
      return NextResponse.json({ validBlPartId: blPartId, corrected: false });
    }

    // 2. If 404, try fallback candidates
    if (storedResult === 'not_found' && rbPartId) {
      const candidates: string[] = [];

      // Try raw RB part ID (if different from BL ID)
      if (rbPartId !== blPartId) {
        candidates.push(rbPartId);
      }

      // Try suffix-stripped variant (e.g., 3957a → 3957)
      const suffixMatch = rbPartId.match(PART_SUFFIX_PATTERN);
      if (suffixMatch?.[1] && suffixMatch[1] !== blPartId) {
        candidates.push(suffixMatch[1]);
      }

      // Also try suffix-stripped of the BL ID itself
      const blSuffixMatch = blPartId.match(PART_SUFFIX_PATTERN);
      if (blSuffixMatch?.[1] && !candidates.includes(blSuffixMatch[1])) {
        candidates.push(blSuffixMatch[1]);
      }

      for (const candidate of candidates) {
        const result = await blValidatePart(candidate);
        if (result === 'exists') {
          // Self-heal: persist the corrected mapping
          if (rbPartId) {
            await persistMapping(rbPartId, candidate, 'auto-validate');
          }
          logger.info('parts.bricklink.validate.corrected', {
            blPartId,
            rbPartId,
            correctedTo: candidate,
          });
          return NextResponse.json({
            validBlPartId: candidate,
            corrected: true,
          });
        }
      }

      // Nothing found — persist negative cache for the RB part ID
      await persistMapping(rbPartId, '', 'bl-not-found');
    }

    return NextResponse.json({ validBlPartId: null, corrected: false });
  } catch (err) {
    logger.error('parts.bricklink.validate.failed', {
      blPartId,
      rbPartId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Return null rather than an error — the caller will show the link as-is
    return NextResponse.json({ validBlPartId: null, corrected: false });
  }
}
