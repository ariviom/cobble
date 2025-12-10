import { errorResponse } from '@/app/lib/api/responses';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { getPart } from '@/app/lib/rebrickable';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

const PART_SUFFIX_PATTERN = /^(\d+)[a-z]$/i;
const RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
const RATE_LIMIT_PER_MINUTE =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;
const RATE_LIMIT_PER_MINUTE_USER =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE_USER ?? '', 10) || 60;

async function checkMappingTable(partId: string): Promise<string | null> {
  try {
    // part_id_mappings requires service role
    const supabase = getCatalogWriteClient();
    const { data, error } = await supabase
      .from('part_id_mappings')
      .select('bl_part_id')
      .eq('rb_part_id', partId)
      .maybeSingle();

    if (error) {
      logger.error('parts.bricklink.mapping_lookup_failed', {
        partId,
        error: error.message,
      });
      return null;
    }

    return data?.bl_part_id ?? null;
  } catch (err) {
    logger.error('parts.bricklink.mapping_error', {
      partId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function persistMapping(
  rbPartId: string,
  blPartId: string,
  source: string
): Promise<void> {
  try {
    // part_id_mappings requires service role
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
      logger.error('parts.bricklink.persist_failed', {
        rbPartId,
        blPartId,
        error: error.message,
      });
    } else {
      logger.debug('parts.bricklink.persisted_mapping', {
        rbPartId,
        blPartId,
        source,
      });
    }
  } catch (err) {
    logger.error('parts.bricklink.persist_error', {
      rbPartId,
      blPartId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function resolveBrickLinkIdFromRebrickable(
  partId: string,
  depth: number = 0
): Promise<string | null> {
  if (depth > 4) return null;

  try {
    const part = await getPart(partId);
    // Rebrickable external_ids.BrickLink is directly an array: ["3024"]
    // Not an object with ext_ids like some other sources
    const external = part.external_ids as Record<string, unknown> | null | undefined;
    const blIds = external?.BrickLink;
    
    // Handle both array format ["3024"] and potential object format {ext_ids: [...]}
    let ids: Array<string | number> = [];
    if (Array.isArray(blIds)) {
      ids = blIds;
    } else if (blIds && typeof blIds === 'object' && 'ext_ids' in blIds) {
      const extIds = (blIds as { ext_ids?: unknown }).ext_ids;
      if (Array.isArray(extIds)) {
        ids = extIds;
      }
    }

    const normalized =
      ids
        .map(id =>
          typeof id === 'number' ? String(id) : typeof id === 'string' ? id : null
        )
        .find(id => id && id.trim().length > 0) ?? null;

    if (normalized) return normalized;

    if (part.print_of && part.print_of.trim().length > 0) {
      return await resolveBrickLinkIdFromRebrickable(
        part.print_of.trim(),
        depth + 1
      );
    }
  } catch {
    // Part not found in Rebrickable
  }

  return null;
}

async function resolveBrickLinkId(partId: string): Promise<string | null> {
  // 1. Check mapping table first (includes previously auto-persisted mappings)
  const cached = await checkMappingTable(partId);
  if (cached) {
    return cached;
  }

  // 2. Try Rebrickable external_ids
  const fromRebrickable = await resolveBrickLinkIdFromRebrickable(partId);
  if (fromRebrickable) {
    return fromRebrickable;
  }

  // 3. Try suffix stripping for "a" suffixed parts (e.g., 3957a → 3957)
  const suffixMatch = partId.match(PART_SUFFIX_PATTERN);
  if (suffixMatch) {
    const baseId = suffixMatch[1];
    if (baseId) {
      const baseResult = await resolveBrickLinkIdFromRebrickable(baseId);
      if (baseResult) {
        // Auto-persist this mapping for future lookups
        await persistMapping(partId, baseResult, 'auto-suffix');
        return baseResult;
      }
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const part = searchParams.get('part');
  if (!part || !part.trim()) {
    incrementCounter('parts_bricklink_validation_failed');
    return errorResponse('missing_required_field', { message: 'Part ID is required' });
  }
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`ip:${clientIp}`, {
    windowMs: RATE_WINDOW_MS,
    maxHits: RATE_LIMIT_PER_MINUTE,
  });
  if (!ipLimit.allowed) {
    incrementCounter('parts_bricklink_rate_limited', { scope: 'ip' });
    return errorResponse('rate_limited', {
      status: 429,
      details: { scope: 'ip', retryAfterSeconds: ipLimit.retryAfterSeconds },
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  // Optional user scope if the request is authenticated (SSR cookies).
  let userId: string | null = null;
  try {
    // Lightweight attempt to read user; failure should not block anon usage.
    const { getSupabaseAuthServerClient } = await import('@/app/lib/supabaseAuthServerClient');
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  if (userId) {
    const userLimit = await consumeRateLimit(`user:${userId}`, {
      windowMs: RATE_WINDOW_MS,
      maxHits: RATE_LIMIT_PER_MINUTE_USER,
    });
    if (!userLimit.allowed) {
      incrementCounter('parts_bricklink_rate_limited', { scope: 'user' });
      return errorResponse('rate_limited', {
        status: 429,
        details: { scope: 'user', retryAfterSeconds: userLimit.retryAfterSeconds },
        headers: { 'Retry-After': String(userLimit.retryAfterSeconds) },
      });
    }
  }
  try {
    const itemNo = await resolveBrickLinkId(part.trim());
    const found = Boolean(itemNo);
    incrementCounter('parts_bricklink_fetched', { found });
    logEvent('parts_bricklink_response', { part: part.trim(), found });
    return NextResponse.json({ itemNo });
  } catch (err) {
    incrementCounter('parts_bricklink_failed', {
      part: part.trim(),
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('parts.bricklink.lookup_failed', {
      part,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('external_service_error', { message: 'Part lookup failed' });
  }
}
