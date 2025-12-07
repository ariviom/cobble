import 'server-only';

import { RATE_LIMIT } from '@/app/lib/constants';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type RateLimitOptions = {
  windowMs?: number;
  maxHits?: number;
};

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

function getBucket(key: string): Bucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  return bucket;
}

function coercePositiveInt(value: string | number | undefined, fallback: number) {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function consumeRateLimitInMemory(
  key: string,
  opts: { windowMs: number; maxHits: number }
): RateLimitResult {
  const bucket = getBucket(key);
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  bucket.timestamps = bucket.timestamps.filter(ts => ts >= windowStart);

  if (bucket.timestamps.length >= opts.maxHits) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterMs = opts.windowMs - (now - oldest);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function getClientIp(req: { headers: Headers }): Promise<string | null> {
  const xff = req.headers.get('x-forwarded-for');
  if (xff && xff.trim().length > 0) {
    const parts = xff.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[0]!;
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) return realIp.trim();
  return null;
}

export async function consumeRateLimit(
  key: string,
  opts?: RateLimitOptions
): Promise<RateLimitResult> {
  const windowMs = coercePositiveInt(
    opts?.windowMs ?? RATE_LIMIT.WINDOW_MS,
    RATE_LIMIT.WINDOW_MS
  );
  const maxHits = coercePositiveInt(
    opts?.maxHits ?? RATE_LIMIT.MAX_HITS,
    RATE_LIMIT.MAX_HITS
  );

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_key: key,
      p_max_hits: maxHits,
      p_window_ms: windowMs,
    });

    if (error) {
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : null;
    const allowed = result?.allowed;
    const retryAfterSeconds = result?.retry_after_seconds;

    if (typeof allowed !== 'boolean' || typeof retryAfterSeconds !== 'number') {
      throw new Error('Unexpected consume_rate_limit response shape');
    }

    return { allowed, retryAfterSeconds };
  } catch (error) {
    logger.warn('rate_limit.distributed_fallback', { key, error: String(error) });
    return consumeRateLimitInMemory(key, { windowMs, maxHits });
  }
}
