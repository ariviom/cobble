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
  const usageCountersTable =
    'usage_counters' as unknown as keyof Database['public']['Tables'];
  const now = new Date();
  const windowStart = getWindowStart(opts.windowKind, now);
  const resetAt = getResetAt(opts.windowKind, now);

  // Read current count
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
    return { allowed: false, limit: opts.limit, remaining: 0, resetAt };
  }

  const current = data?.count ?? 0;
  if (current >= opts.limit) {
    return { allowed: false, limit: opts.limit, remaining: 0, resetAt };
  }

  const nextCount = current + 1;
  const { error: upsertError } = await supabase
    .from(usageCountersTable)
    .upsert({
      user_id: opts.userId,
      feature_key: opts.featureKey,
      window_kind: opts.windowKind,
      window_start: windowStart,
      count: nextCount,
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    logger.error('usage_counters.upsert_failed', {
      error: upsertError.message,
      featureKey: opts.featureKey,
    });
    return { allowed: false, limit: opts.limit, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    limit: opts.limit,
    remaining: Math.max(opts.limit - nextCount, 0),
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
