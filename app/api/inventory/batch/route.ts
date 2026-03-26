import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getSetInventoriesBatchWithMeta } from '@/app/lib/services/inventory';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getInventoryVersion } from '../versionCache';

export const dynamic = 'force-dynamic';
const CACHE_CONTROL = 'private, max-age=300';
const MAX_BATCH_SIZE = 50;

const bodySchema = z.object({
  sets: z.array(z.string().min(1).max(200)).min(1).max(MAX_BATCH_SIZE),
  includeMeta: z.boolean().optional(),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`inventory-batch:ip:${clientIp}`, {
    windowMs: 60_000,
    maxHits: 20,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation_failed', {
      message: 'Invalid JSON body',
    });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    incrementCounter('inventory_batch_validation_failed', {
      issues: parsed.error.flatten(),
    });
    return errorResponse('validation_failed', {
      details: { issues: parsed.error.flatten() },
    });
  }

  const { sets, includeMeta } = parsed.data;

  try {
    const [inventoryVersion, resultsMap] = await Promise.all([
      getInventoryVersion(),
      getSetInventoriesBatchWithMeta(sets),
    ]);

    const inventories: Record<
      string,
      { rows: unknown[]; meta?: { totalMinifigs: number } }
    > = {};
    let partial = false;

    for (const setNum of sets) {
      const result = resultsMap.get(setNum);
      if (!result) {
        partial = true;
        continue;
      }
      const entry: { rows: unknown[]; meta?: { totalMinifigs: number } } = {
        rows: result.rows,
      };
      if (includeMeta && result.minifigMeta) {
        entry.meta = result.minifigMeta;
      }
      inventories[setNum] = entry;
    }

    incrementCounter('inventory_batch_fetched', {
      requested: sets.length,
      returned: Object.keys(inventories).length,
    });
    logEvent('inventory_batch_response', {
      requested: sets.length,
      returned: Object.keys(inventories).length,
      partial,
    });

    return NextResponse.json(
      { inventories, inventoryVersion, partial },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    incrementCounter('inventory_batch_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('inventory.batch.failed', {
      sets,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('inventory_batch_failed');
  }
});
