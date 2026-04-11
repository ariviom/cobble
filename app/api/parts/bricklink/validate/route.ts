import { errorResponse } from '@/app/lib/api/responses';
import { blValidatePart } from '@/app/lib/bricklink';
import {
  BL_RATE_LIMIT_IP,
  BL_RATE_WINDOW_MS,
} from '@/app/lib/bricklink/rateLimitConfig';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { incrementCounter, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

const PART_SUFFIX_PATTERN = /^(\d+)[a-z]$/i;

/**
 * On-demand validation: given a stored BL part ID (and optionally the RB part ID),
 * validate that the BL part exists. If not, try fallback candidates and return
 * the first valid one (self-healing rb_parts.bl_part_id).
 *
 * Query params:
 *   blPartId - the stored BrickLink part ID to validate
 *   rbPartId - (optional) Rebrickable part ID for fallback candidates
 *
 * Response:
 *   { validBlPartId: string | null, corrected: boolean }
 */
export async function GET(req: NextRequest) {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return errorResponse('unauthorized');
  }

  const { searchParams } = new URL(req.url);
  const blPartId = searchParams.get('blPartId')?.trim();
  const rbPartId = searchParams.get('rbPartId')?.trim();

  if (!blPartId) {
    return errorResponse('missing_required_field', {
      message: 'blPartId is required',
    });
  }

  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`bl-validate:ip:${clientIp}`, {
    windowMs: BL_RATE_WINDOW_MS,
    maxHits: BL_RATE_LIMIT_IP,
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
    if (storedResult === 'error') {
      // BL API call failed (auth, circuit breaker, network). We cannot
      // verify the part — surface as 502 so the caller can fall back to
      // showing the link as-is rather than a misleading "Not on BrickLink".
      return errorResponse('external_service_error', {
        message: 'Could not verify BrickLink part',
      });
    }

    // 2. storedResult === 'not_found' — try fallback candidates
    if (rbPartId) {
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
        if (result === 'error') {
          // Same reasoning as above — can't verify, surface as 502.
          return errorResponse('external_service_error', {
            message: 'Could not verify BrickLink part',
          });
        }
      }
    }

    return NextResponse.json({ validBlPartId: null, corrected: false });
  } catch (err) {
    logger.error('parts.bricklink.validate.failed', {
      blPartId,
      rbPartId,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('external_service_error', {
      message: 'Could not verify BrickLink part',
    });
  }
}
