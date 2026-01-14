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

  // Use atomic RPC function to prevent race conditions where concurrent requests
  // could both read the same count and both increment, exceeding the limit
  const { data, error } = await supabase.rpc('increment_usage_counter', {
    p_user_id: opts.userId,
    p_feature_key: opts.featureKey,
    p_window_kind: opts.windowKind,
    p_window_start: windowStart,
    p_limit: opts.limit,
  });

  if (error) {
    logger.error('usage_counters.increment_failed', {
      error: error.message,
      featureKey: opts.featureKey,
    });
    return { allowed: false, limit: opts.limit, remaining: 0, resetAt };
  }

  // RPC returns array with single row: { allowed: boolean, new_count: number }
  const result = Array.isArray(data) ? data[0] : data;
  const allowed = result?.allowed ?? false;
  const newCount = result?.new_count ?? opts.limit;

  return {
    allowed,
    limit: opts.limit,
    remaining: Math.max(opts.limit - newCount, 0),
    resetAt,
  };
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
