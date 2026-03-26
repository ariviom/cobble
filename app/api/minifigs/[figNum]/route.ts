import { errorResponse } from '@/app/lib/api/responses';
import {
  BL_RATE_LIMIT_IP_STRICT,
  BL_RATE_WINDOW_MS,
} from '@/app/lib/bricklink/rateLimitConfig';
import {
  getMinifigMeta,
  type MinifigMeta,
} from '@/app/lib/services/minifigMeta';
import { incrementCounter, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ figNum: string }> }
): Promise<NextResponse<MinifigMeta | { error: string }>> {
  const { searchParams } = new URL(req.url);
  const includeSubparts =
    (searchParams.get('includeSubparts') ?? '').toLowerCase() === 'true';
  const includePricing =
    (searchParams.get('includePricing') ?? '').toLowerCase() === 'true';

  const { figNum } = await params;
  const inputId = figNum.trim();
  if (!inputId) {
    return errorResponse('missing_required_field', {
      message: 'Minifig figure number is required',
    });
  }

  // Validate minifig ID format: alphanumeric with optional dashes/underscores
  // Max length 50 chars to prevent abuse, typical IDs are < 15 chars
  // Examples: sw0001, cty0123, hp001, njo001, fig-000001
  const MINIFIG_ID_PATTERN = /^[a-zA-Z0-9][\w-]{0,49}$/;
  if (!MINIFIG_ID_PATTERN.test(inputId)) {
    return errorResponse('validation_failed', {
      message: 'Invalid minifig ID format',
    });
  }

  // Rate-limit when pricing is requested (hits BrickLink API)
  if (includePricing) {
    const clientIp = (await getClientIp(req)) ?? 'unknown';
    const ipLimit = await consumeRateLimit(`bl-minifig:ip:${clientIp}`, {
      windowMs: BL_RATE_WINDOW_MS,
      maxHits: BL_RATE_LIMIT_IP_STRICT,
    });
    if (!ipLimit.allowed) {
      incrementCounter('minifig_pricing_rate_limited');
      return errorResponse('rate_limited', {
        status: 429,
        details: {
          scope: 'ip',
          retryAfterSeconds: ipLimit.retryAfterSeconds,
        },
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      });
    }
  }

  try {
    const result = await getMinifigMeta(inputId, {
      includeSubparts,
      includePricing,
    });

    const headers: Record<string, string> = includePricing
      ? { 'Cache-Control': 'private, max-age=300' }
      : {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        };

    return NextResponse.json(result, { headers });
  } catch (err) {
    logger.error('minifig.unexpected_error', {
      inputMinifigId: inputId,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('minifig_meta_failed', {
      message: 'Failed to fetch minifig metadata',
    });
  }
}
