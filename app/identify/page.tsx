'use server';

import { getEntitlements } from '@/app/lib/services/entitlements';
import { getUsageStatus } from '@/app/lib/services/usageCounters';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import IdentifyClient from './IdentifyClient';

export default async function IdentifyPage() {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <IdentifyClient
        initialQuota={{ status: 'unauthorized' }}
        isAuthenticated={false}
      />
    );
  }

  const entitlements = await getEntitlements(user.id, { supabase });

  if (entitlements.features.includes('identify.unlimited')) {
    return (
      <IdentifyClient
        initialQuota={{ status: 'unlimited', tier: entitlements.tier }}
        isAuthenticated
      />
    );
  }

  const usage = await getUsageStatus({
    userId: user.id,
    featureKey: 'identify:daily',
    windowKind: 'daily',
    limit: 5,
    supabase,
  });

  return (
    <IdentifyClient
      initialQuota={{
        status: 'metered',
        tier: entitlements.tier,
        limit: usage.limit,
        remaining: usage.remaining,
        resetAt: usage.resetAt,
      }}
      isAuthenticated
    />
  );
}
