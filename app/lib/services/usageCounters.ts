import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Database } from '@/supabase/types';
import { logger } from '@/lib/metrics';

export type UsageWindowKind = 'daily' | 'monthly';

export type UsageCheckResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string; // ISO timestamp at window boundary
};

export type UsageStatus = {
  count: number;
  limit: number;
  remaining: number;
  resetAt: string;
};

type IncrementOptions = {
  userId: string;
  featureKey: string;
  windowKind: UsageWindowKind;
  limit: number;
  supabase?: SupabaseClient<Database>;
};

function getWindowStart(windowKind: UsageWindowKind, now: Date): string {
  if (windowKind === 'daily') {
    return now.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  // monthly: first day of month UTC
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function getResetAt(windowKind: UsageWindowKind, now: Date): string {
  if (windowKind === 'daily') {
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
    );
    return tomorrow.toISOString();
  }
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  return nextMonth.toISOString();
}

export async function checkAndIncrementUsage(
  opts: IncrementOptions
): Promise<UsageCheckResult> {
  const supabase = opts.supabase ?? getSupabaseServiceRoleClient();
  const now = new Date();
  const windowStart = getWindowStart(opts.windowKind, now);
  const resetAt = getResetAt(opts.windowKind, now);

  // Try atomic RPC first (prevents race conditions where concurrent requests
  // both read the same count and both increment, exceeding the limit)
  const { data, error } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => ReturnType<typeof supabase.rpc>
  )('increment_usage_counter', {
    p_user_id: opts.userId,
    p_feature_key: opts.featureKey,
    p_window_kind: opts.windowKind,
    p_window_start: windowStart,
    p_limit: opts.limit,
  });

  if (!error) {
    // RPC returns array with single row: { allowed: boolean, new_count: number }
    type RpcResult = { allowed: boolean; new_count: number };
    const result = (Array.isArray(data)
      ? data[0]
      : data) as unknown as RpcResult | null;
    const allowed = result?.allowed ?? false;
    const newCount = result?.new_count ?? opts.limit;

    return {
      allowed,
      limit: opts.limit,
      remaining: Math.max(opts.limit - newCount, 0),
      resetAt,
    };
  }

  // RPC failed — fall back to non-atomic read-then-write so users aren't
  // hard-blocked when the RPC function is unavailable.
  logger.warn('usage_counters.rpc_fallback', {
    error: error.message,
    featureKey: opts.featureKey,
  });

  return incrementFallback(supabase, opts, windowStart, resetAt);
}

/**
 * Non-atomic fallback: read current count, check limit, then upsert.
 * Has a small race window but keeps quota enforcement working when the
 * atomic RPC function is unavailable (e.g. migration not yet applied).
 */
async function incrementFallback(
  supabase: SupabaseClient<Database>,
  opts: IncrementOptions,
  windowStart: string,
  resetAt: string
): Promise<UsageCheckResult> {
  const table =
    'usage_counters' as unknown as keyof Database['public']['Tables'];

  // Read current count
  const { data: existing, error: readError } = await supabase
    .from(table)
    .select('count')
    .eq('user_id', opts.userId)
    .eq('feature_key', opts.featureKey)
    .eq('window_kind', opts.windowKind)
    .eq('window_start', windowStart)
    .maybeSingle();

  if (readError) {
    logger.error('usage_counters.fallback_read_failed', {
      error: readError.message,
      featureKey: opts.featureKey,
    });
    return { allowed: false, limit: opts.limit, remaining: 0, resetAt };
  }

  const currentCount = (existing as { count: number } | null)?.count ?? 0;
  if (currentCount >= opts.limit) {
    return {
      allowed: false,
      limit: opts.limit,
      remaining: 0,
      resetAt,
    };
  }

  // Upsert incremented count (type assertion needed — table not in generated types)
  const { error: writeError } = await (
    supabase.from(table) as unknown as {
      upsert: (
        values: Record<string, unknown>,
        options?: { onConflict?: string }
      ) => PromiseLike<{ error: { message: string } | null }>;
    }
  ).upsert(
    {
      user_id: opts.userId,
      feature_key: opts.featureKey,
      window_kind: opts.windowKind,
      window_start: windowStart,
      count: currentCount + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,feature_key,window_kind,window_start' }
  );

  if (writeError) {
    logger.error('usage_counters.fallback_write_failed', {
      error: writeError.message,
      featureKey: opts.featureKey,
    });
    // Write failed but read succeeded — allow the request since count was under limit
    return {
      allowed: true,
      limit: opts.limit,
      remaining: Math.max(opts.limit - currentCount - 1, 0),
      resetAt,
    };
  }

  const newCount = currentCount + 1;
  return {
    allowed: true,
    limit: opts.limit,
    remaining: Math.max(opts.limit - newCount, 0),
    resetAt,
  };
}

/**
 * Increment usage counter without checking the limit.
 * Used after a successful operation when the pre-check already gated access.
 */
export async function incrementUsage(
  opts: Omit<IncrementOptions, 'limit'>
): Promise<void> {
  const supabase = opts.supabase ?? getSupabaseServiceRoleClient();
  const now = new Date();
  const windowStart = getWindowStart(opts.windowKind, now);

  // Use the atomic RPC to increment by 1 (pass a high limit so it always succeeds)
  const { error } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => ReturnType<typeof supabase.rpc>
  )('increment_usage_counter', {
    p_user_id: opts.userId,
    p_feature_key: opts.featureKey,
    p_window_kind: opts.windowKind,
    p_window_start: windowStart,
    p_limit: 999999,
  });

  if (error) {
    // RPC unavailable — fall back to read-then-write
    logger.warn('usage_counters.increment_rpc_fallback', {
      error: error.message,
      featureKey: opts.featureKey,
    });

    const table =
      'usage_counters' as unknown as keyof Database['public']['Tables'];
    const { data: existing } = await supabase
      .from(table)
      .select('count')
      .eq('user_id', opts.userId)
      .eq('feature_key', opts.featureKey)
      .eq('window_kind', opts.windowKind)
      .eq('window_start', windowStart)
      .maybeSingle();

    const currentCount = (existing as { count: number } | null)?.count ?? 0;
    const { error: writeError } = await (
      supabase.from(table) as unknown as {
        upsert: (
          values: Record<string, unknown>,
          options?: { onConflict?: string }
        ) => PromiseLike<{ error: { message: string } | null }>;
      }
    ).upsert(
      {
        user_id: opts.userId,
        feature_key: opts.featureKey,
        window_kind: opts.windowKind,
        window_start: windowStart,
        count: currentCount + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,feature_key,window_kind,window_start' }
    );

    if (writeError) {
      logger.warn('usage_counters.increment_fallback_write_failed', {
        error: writeError.message,
        featureKey: opts.featureKey,
      });
    }
  }
}

export async function getUsageStatus(
  opts: Omit<IncrementOptions, 'limit'> & { limit: number }
): Promise<UsageStatus> {
  const supabase = opts.supabase ?? getSupabaseServiceRoleClient();
  const usageCountersTable =
    'usage_counters' as unknown as keyof Database['public']['Tables'];
  const now = new Date();
  const windowStart = getWindowStart(opts.windowKind, now);
  const resetAt = getResetAt(opts.windowKind, now);

  const { data, error } = await supabase
    .from(usageCountersTable)
    .select('count')
    .eq('user_id', opts.userId)
    .eq('feature_key', opts.featureKey)
    .eq('window_kind', opts.windowKind)
    .eq('window_start', windowStart)
    .maybeSingle();

  if (error) {
    logger.error('usage_counters.read_failed', {
      error: error.message,
      featureKey: opts.featureKey,
    });
    return { count: 0, limit: opts.limit, remaining: opts.limit, resetAt };
  }

  const count = data?.count ?? 0;
  const remaining = Math.max(opts.limit - count, 0);
  return { count, limit: opts.limit, remaining, resetAt };
}
