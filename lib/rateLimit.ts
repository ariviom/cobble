type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
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
  opts?: {
    windowMs?: number;
    maxHits?: number;
  }
): Promise<RateLimitResult> {
  const windowMs = coercePositiveInt(opts?.windowMs ?? 60_000, 60_000);
  const maxHits = coercePositiveInt(opts?.maxHits ?? 60, 60);

  const bucket = getBucket(key);
  const now = Date.now();
  const windowStart = now - windowMs;

  // drop old timestamps
  bucket.timestamps = bucket.timestamps.filter(ts => ts >= windowStart);

  if (bucket.timestamps.length >= maxHits) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterMs = windowMs - (now - oldest);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSeconds: 0 };
}
