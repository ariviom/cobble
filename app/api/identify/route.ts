import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { LRUCache } from '@/app/lib/cache/lru';
import { EXTERNAL, IMAGE, RATE_LIMIT } from '@/app/lib/constants';
import { PipelineBudget } from '@/app/lib/identify/budget';
import { runIdentifyPipeline } from '@/app/lib/identify/pipeline';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { getEntitlements, hasFeature } from '@/app/lib/services/entitlements';
import {
  checkAndIncrementUsage,
  getUsageStatus,
} from '@/app/lib/services/usageCounters';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';

const ALLOWED_IMAGE_TYPES = new Set<string>(IMAGE.ALLOWED_TYPES);
const IDENTIFY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h local cache
const IDENTIFY_CACHE_MAX = 500;

type CachedIdentifyResponse = {
  status: number;
  body: unknown;
  cachedAt: number;
};

const localIdentifyCache = new LRUCache<string, CachedIdentifyResponse>(
  IDENTIFY_CACHE_MAX,
  IDENTIFY_CACHE_TTL_MS
);

function getCachedResponse(cacheKey: string): CachedIdentifyResponse | null {
  return localIdentifyCache.get(cacheKey) ?? null;
}

function setCachedResponse(cacheKey: string, status: number, body: unknown) {
  localIdentifyCache.set(cacheKey, { status, body, cachedAt: Date.now() });
}

function isFileLike(value: unknown): value is Blob {
  if (!value || typeof value !== 'object') return false;
  return value instanceof Blob || value instanceof File;
}

const identifyBodySchema = z.object({
  image: z
    .custom<Blob>(isFileLike, { message: 'image_file_required' })
    .refine(
      file =>
        typeof file.size === 'number' &&
        file.size > 0 &&
        file.size <= IMAGE.MAX_SIZE_BYTES,
      { message: 'image_must_be_between_1b_and_5mb' }
    )
    .refine(
      file => {
        const type = (file as { type?: string }).type;
        return !type || ALLOWED_IMAGE_TYPES.has(type.toLowerCase());
      },
      { message: `image_type_must_be_one_of_${IMAGE.ALLOWED_TYPES.join(',')}` }
    ),
  colorHint: z.preprocess(val => {
    if (val === null || val === undefined || val === '') return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const num = Number(val);
      return Number.isFinite(num) ? num : undefined;
    }
    return undefined;
  }, z.number().optional()),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
  try {
    // Rate limit
    const clientIp = (await getClientIp(req)) ?? 'unknown';
    const ipLimit = await consumeRateLimit(`identify:ip:${clientIp}`, {
      windowMs: RATE_LIMIT.WINDOW_MS,
      maxHits: RATE_LIMIT.IDENTIFY_MAX,
    });
    if (!ipLimit.allowed) {
      return errorResponse('rate_limited', {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
        details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
      });
    }

    // Auth
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('unauthorized', { message: 'sign_in_required' });
    }

    // Validation
    const form = await req.formData();
    const parsed = identifyBodySchema.safeParse({
      image: form.get('image'),
      colorHint: form.get('colorHint'),
    });
    if (!parsed.success) {
      return errorResponse('validation_failed', {
        details: parsed.error.flatten(),
      });
    }
    const { image, colorHint } = parsed.data;

    // Dedup via image hash
    const arrayBuf = await (image as Blob).arrayBuffer();
    const imageHash = crypto
      .createHash('sha256')
      .update(Buffer.from(arrayBuf))
      .digest('hex');
    const cacheKey = `${user.id}:${imageHash}`;

    // Cache check
    const cached = getCachedResponse(cacheKey);
    const entitlements = await getEntitlements(user.id);
    const hasUnlimited = hasFeature(entitlements, 'identify.unlimited');

    if (cached) {
      if (!hasUnlimited) {
        const usage = await getUsageStatus({
          userId: user.id,
          featureKey: 'identify:daily',
          windowKind: 'daily',
          limit: 5,
        });
        if (usage.remaining === 0) {
          return NextResponse.json(
            {
              error: 'feature_unavailable',
              reason: 'quota_exceeded',
              limit: usage.limit,
              remaining: usage.remaining,
              resetAt: usage.resetAt,
              dedupe: true,
            },
            { status: 429 }
          );
        }
      }
      return NextResponse.json(cached.body, { status: cached.status });
    }

    // Quota
    if (!hasUnlimited) {
      const usage = await checkAndIncrementUsage({
        userId: user.id,
        featureKey: 'identify:daily',
        windowKind: 'daily',
        limit: 5,
      });
      if (!usage.allowed) {
        return NextResponse.json(
          {
            error: 'feature_unavailable',
            reason: 'quota_exceeded',
            limit: usage.limit,
            remaining: usage.remaining,
            resetAt: usage.resetAt,
            dedupe: false,
          },
          { status: 429 }
        );
      }
    }

    // Pipeline
    const budget = new PipelineBudget(EXTERNAL.EXTERNAL_CALL_BUDGET);
    const result = await runIdentifyPipeline(
      { image: image as Blob, colorHint },
      budget
    );

    if (result.status === 'no_match') return errorResponse('no_match');
    if (result.status === 'no_valid_candidate')
      return errorResponse('no_valid_candidate');

    // Budget exhaustion with no useful results → 429
    if (
      budget.isExhausted &&
      result.status === 'fallback' &&
      !result.payload.sets.length
    ) {
      return errorResponse('budget_exceeded', { status: 429 });
    }

    // Shape response
    if (result.status === 'fallback') {
      const body = {
        part: result.payload.part,
        blPartId: result.payload.blPartId,
        blAvailableColors: result.payload.blAvailableColors,
        source: result.payload.source,
        candidates: result.payload.candidates,
        availableColors: result.payload.availableColors,
        selectedColorId: result.payload.selectedColorId,
        sets: result.payload.sets,
      };
      setCachedResponse(cacheKey, 200, body);
      return NextResponse.json(body);
    }

    setCachedResponse(cacheKey, 200, result.payload);
    return NextResponse.json(result.payload);
  } catch (err) {
    logger.error('identify.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('identify_failed');
  }
});
