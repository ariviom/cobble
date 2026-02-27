import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { LRUCache } from '@/app/lib/cache/lru';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Database } from '@/supabase/types';
import { logger } from '@/lib/metrics';

import { getUserEntitlements } from './billing';

export type FeatureFlagResolved = {
  key: string;
  minTier: 'free' | 'plus' | 'pro';
  isEnabled: boolean;
  rolloutPct: number;
};

export type Entitlements = {
  tier: 'free' | 'plus' | 'pro';
  features: string[];
  featureFlagsByKey: Record<string, FeatureFlagResolved>;
};

type Options = {
  supabase?: SupabaseClient<Database>;
};

// Use LRU cache with TTL to prevent unbounded memory growth
// Max 1000 entries, 5 minute TTL (entitlements can change via billing updates)
const ENTITLEMENTS_CACHE_MAX = 1000;
const ENTITLEMENTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const entitlementsCache = new LRUCache<string, Entitlements>(
  ENTITLEMENTS_CACHE_MAX,
  ENTITLEMENTS_CACHE_TTL_MS
);

/** Evict cached entitlements so the next call fetches fresh data from the DB. */
export function invalidateEntitlements(userId: string): void {
  entitlementsCache.delete(userId);
}

const TIER_RANK: Record<Entitlements['tier'], number> = {
  free: 0,
  plus: 1,
  pro: 2,
};

function hashToPercent(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

function applyRollout(flag: FeatureFlagResolved, userId: string): boolean {
  if (!flag.isEnabled) return false;
  if (flag.rolloutPct >= 100) return true;
  const bucket = hashToPercent(userId);
  return bucket < flag.rolloutPct;
}

function isFlagEligibleForTier(
  flag: FeatureFlagResolved,
  tier: Entitlements['tier']
): boolean {
  return TIER_RANK[tier] >= TIER_RANK[flag.minTier];
}

async function loadFlags(
  supabase: SupabaseClient<Database>
): Promise<Record<string, FeatureFlagResolved>> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('key,min_tier,rollout_pct,is_enabled');

  if (error) {
    logger.error('entitlements.flags_load_failed', { error: error.message });
    return {};
  }

  const map: Record<string, FeatureFlagResolved> = {};
  for (const row of data ?? []) {
    map[row.key] = {
      key: row.key,
      minTier: (row.min_tier as FeatureFlagResolved['minTier']) ?? 'free',
      isEnabled: row.is_enabled ?? false,
      rolloutPct: row.rollout_pct ?? 0,
    };
  }
  return map;
}

async function loadOverrides(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('feature_overrides')
    .select('feature_key, force')
    .eq('user_id', userId);

  if (error) {
    logger.error('entitlements.overrides_load_failed', {
      error: error.message,
    });
    return {};
  }

  const map: Record<string, boolean> = {};
  for (const row of data ?? []) {
    if (!row.feature_key) continue;
    map[row.feature_key] = row.force ?? false;
  }
  return map;
}

export async function getEntitlements(
  userId: string,
  options?: Options
): Promise<Entitlements> {
  const cacheKey = userId;
  if (entitlementsCache.has(cacheKey)) {
    return entitlementsCache.get(cacheKey)!;
  }

  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();

  const base = await getUserEntitlements(userId, {
    supabase,
  });

  const tier: Entitlements['tier'] = base.tier;

  // Use service role client for reading feature flags and overrides
  // because these tables have restrictive RLS policies
  const serviceClient = getSupabaseServiceRoleClient();
  const flags = await loadFlags(serviceClient);
  const overrides = await loadOverrides(serviceClient, userId);

  const features: string[] = [];

  for (const flag of Object.values(flags)) {
    const override = overrides[flag.key];
    if (override === true) {
      features.push(flag.key);
      continue;
    }
    if (override === false) {
      continue;
    }
    if (!isFlagEligibleForTier(flag, tier)) {
      continue;
    }
    if (!applyRollout(flag, userId)) {
      continue;
    }
    features.push(flag.key);
  }

  const entitlements: Entitlements = {
    tier,
    features,
    featureFlagsByKey: flags,
  };
  entitlementsCache.set(cacheKey, entitlements);
  return entitlements;
}

export function hasFeature(
  entitlements: Entitlements,
  featureKey: string
): boolean {
  return entitlements.features.includes(featureKey);
}

type AssertFeatureOptions = {
  featureDisplayName?: string;
};

export function assertFeature(
  entitlements: Entitlements,
  featureKey: string,
  options?: AssertFeatureOptions
): void {
  if (hasFeature(entitlements, featureKey)) return;
  const display = options?.featureDisplayName ?? featureKey;
  const error: Error & { code?: string; reason?: string } = new Error(
    `Feature unavailable: ${display}`
  );
  error.code = 'feature_unavailable';
  error.reason = 'upgrade_required';
  throw error;
}
