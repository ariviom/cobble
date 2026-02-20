import { errorResponse } from '@/app/lib/api/responses';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getSetInventoryRowsWithMeta } from '@/app/lib/services/inventory';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  VERSION_CACHE_TTL_MS,
  getVersionCache,
  setVersionCache,
} from './versionCache';

// Ensure Next.js treats this route as dynamic (no server-side caching)
export const dynamic = 'force-dynamic';

// Browser-only caching (private prevents CDN/proxy caching)
const CACHE_CONTROL = 'private, max-age=300';

const querySchema = z.object({
  set: z.string().min(1).max(200),
  // Optional: include minifig mapping metadata in response
  includeMeta: z.enum(['true', 'false']).optional(),
});

async function getInventoryVersion(): Promise<string | null> {
  const now = Date.now();
  const cached = getVersionCache();
  if (cached && now - cached.at < VERSION_CACHE_TTL_MS) {
    return cached.version;
  }

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase
      .from('rb_download_versions')
      .select('version')
      .eq('source', 'inventory_parts')
      .maybeSingle();
    if (error) {
      logger.warn('inventory.version.read_failed', { error: error.message });
      return null;
    }
    const version = (data?.version as string | null | undefined) ?? null;
    setVersionCache({ at: now, version });
    return version;
  } catch (err) {
    logger.warn('inventory.version.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function GET(req: NextRequest) {
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
    // Check for circuit breaker open
    if (err instanceof Error && err.message === 'rebrickable_circuit_open') {
      const retryAfterMs =
        (err as Error & { retryAfterMs?: number }).retryAfterMs ?? 60_000;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      incrementCounter('inventory_circuit_open', { setNumber: set });
      return errorResponse('rebrickable_circuit_open', {
        message:
          'Rebrickable API is temporarily unavailable. Please try again shortly.',
        status: 503,
        details: { retryAfterSeconds },
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
