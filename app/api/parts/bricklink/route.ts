import { getPart } from '@/app/lib/rebrickable';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

const PART_SUFFIX_PATTERN = /^(\d+)[a-z]$/i;
const RATE_WINDOW_MS =
  Number.parseInt(process.env.BL_RATE_WINDOW_MS ?? '', 10) || 60_000;
const RATE_LIMIT_PER_MINUTE =
  Number.parseInt(process.env.BL_RATE_LIMIT_PER_MINUTE ?? '', 10) || 60;

async function checkMappingTable(partId: string): Promise<string | null> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('part_id_mappings')
      .select('bl_part_id')
      .eq('rb_part_id', partId)
      .maybeSingle();

    if (error) {
      console.error('[parts/bricklink] mapping table lookup failed', {
        partId,
        error: error.message,
      });
      return null;
    }

    return data?.bl_part_id ?? null;
  } catch (err) {
    console.error('[parts/bricklink] mapping table error', {
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
    const supabase = getSupabaseServiceRoleClient();
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
      console.error('[parts/bricklink] failed to persist mapping', {
        rbPartId,
        blPartId,
        error: error.message,
      });
    } else if (process.env.NODE_ENV !== 'production') {
      console.log('[parts/bricklink] persisted mapping', {
        rbPartId,
        blPartId,
        source,
      });
    }
  } catch (err) {
    console.error('[parts/bricklink] persist error', {
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
    return NextResponse.json({ error: 'missing_part' }, { status: 400 });
  }
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`ip:${clientIp}`, {
    windowMs: RATE_WINDOW_MS,
    maxHits: RATE_LIMIT_PER_MINUTE,
  });
  if (!ipLimit.allowed) {
    incrementCounter('parts_bricklink_rate_limited', { scope: 'ip' });
    return NextResponse.json(
      {
        error: 'rate_limited',
        scope: 'ip',
        retryAfterSeconds: ipLimit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      }
    );
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
    if (process.env.NODE_ENV !== 'production') {
      console.error('parts/bricklink lookup failed', {
        part,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.json({ error: 'part_lookup_failed' }, { status: 500 });
  }
}
