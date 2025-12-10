import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';
import {
  DEFAULT_PRICING_PREFERENCES,
  normalizePricingPreferences,
} from '@/app/lib/pricing';
import type { PricingPreferences } from '@/app/lib/pricing';

export type SupabaseDbClient = SupabaseClient<Database>;

type UserPreferencesRow =
  Database['public']['Tables']['user_preferences']['Row'];

type UserPreferencesSettings = UserPreferencesRow['settings'];

function extractPricingFromSettings(
  settings: UserPreferencesSettings
): Partial<PricingPreferences> | null {
  if (!settings || typeof settings !== 'object') return null;
  const pricing = (settings as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== 'object') return null;
  const obj = pricing as { currencyCode?: unknown; countryCode?: unknown };
  const result: Partial<PricingPreferences> = {};

  if (typeof obj.currencyCode === 'string') {
    result.currencyCode = obj.currencyCode;
  }

  if (typeof obj.countryCode === 'string' || obj.countryCode === null) {
    result.countryCode = obj.countryCode as string | null;
  }

  return result;
}

export async function loadUserPricingPreferences(
  supabase: SupabaseDbClient,
  userId: string
): Promise<PricingPreferences> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        console.warn('loadUserPricingPreferences: failed to load', {
          userId,
          error: error.message,
        });
      } catch {}
    }
    return DEFAULT_PRICING_PREFERENCES;
  }

  const rawPricing = extractPricingFromSettings(data?.settings ?? null);
  if (!rawPricing) {
    return DEFAULT_PRICING_PREFERENCES;
  }

  return normalizePricingPreferences(rawPricing);
}

export async function saveUserPricingPreferences(
  supabase: SupabaseDbClient,
  userId: string,
  patch: Partial<PricingPreferences>
): Promise<void> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error && process.env.NODE_ENV !== 'production') {
    try {
      console.warn('saveUserPricingPreferences: failed to load existing', {
        userId,
        error: error.message,
      });
    } catch {}
  }

  const existingSettings =
    data?.settings && typeof data.settings === 'object'
      ? (data.settings as Record<string, unknown>)
      : {};

  const existingPricing =
    existingSettings.pricing && typeof existingSettings.pricing === 'object'
      ? (existingSettings.pricing as Partial<PricingPreferences>)
      : {};

  const nextPricing = normalizePricingPreferences({
    ...existingPricing,
    ...patch,
  });

  const nextSettings = {
    ...existingSettings,
    pricing: nextPricing,
  };

  await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      updated_at: new Date().toISOString(),
      settings: nextSettings,
    },
    { onConflict: 'user_id' }
  );
}
