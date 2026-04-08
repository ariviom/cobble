import { handleCircuitBreakerError } from '@/app/lib/api/circuitBreakerError';
import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT } from '@/app/lib/constants';
import { getSetInventoryRowsWithMeta } from '@/app/lib/services/inventory';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getInventoryVersion } from './versionCache';

// Ensure Next.js treats this route as dynamic (no server-side caching)
export const dynamic = 'force-dynamic';

// Browser-only caching (private prevents CDN/proxy caching)
const CACHE_CONTROL = 'private, max-age=300';

const querySchema = z.object({
  set: z.string().min(1).max(200),
  // Optional: include minifig mapping metadata in response
  includeMeta: z.enum(['true', 'false']).optional(),
});

export async function GET(req: NextRequest) {
  // IP-based rate limit
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`inventory:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.SEARCH_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!parsed.success) {
    incrementCounter('inventory_validation_failed', {
      issues: parsed.error.flatten(),
    });
    return errorResponse('validation_failed', {
      details: { issues: parsed.error.flatten() },
    });
  }
  const set = parsed.data.set;
  const includeMeta = parsed.data.includeMeta === 'true';

  try {
    const [inventoryVersion, result] = await Promise.all([
      getInventoryVersion(),
      getSetInventoryRowsWithMeta(set),
    ]);
    incrementCounter('inventory_fetched', { setNumber: set });
    logEvent('inventory_response', {
      setNumber: set,
      count: result.rows.length,
      totalMinifigs: result.minifigMeta?.totalMinifigs,
    });

    // Return rows and optionally include metadata
    const response: {
      rows: typeof result.rows;
      meta?: typeof result.minifigMeta;
      inventoryVersion: string | null;
    } = { rows: result.rows, inventoryVersion };

    if (includeMeta && result.minifigMeta) {
      response.meta = result.minifigMeta;
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'rebrickable_circuit_open') {
      return handleCircuitBreakerError(err, {
        counterName: 'inventory_circuit_open',
        counterDetails: { setNumber: set },
      });
    }

    incrementCounter('inventory_failed', {
      setNumber: set,
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('inventory.route.failed', {
      setNumber: set,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('inventory_failed');
  }
}
