import 'server-only';

import type { PricingPreferences } from '@/app/lib/pricing';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { logger } from '@/lib/metrics';

export async function resolveUserPricingContext(): Promise<{
  userId: string | null;
  pricingPrefs: PricingPreferences;
}> {
  let pricingPrefs = DEFAULT_PRICING_PREFERENCES;
  let userId: string | null = null;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!userError && user) {
      userId = user.id;
      pricingPrefs = await loadUserPricingPreferences(supabase, user.id);
    }
  } catch (err) {
    logger.warn('pricing_context.load_prefs_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { userId, pricingPrefs };
}
