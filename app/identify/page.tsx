import { getEntitlements } from '@/app/lib/services/entitlements';
import { getUsageStatus } from '@/app/lib/services/usageCounters';
import { getSupabaseSession } from '@/app/lib/supabaseAuthServerClient';
import type { Metadata } from 'next';
import IdentifyClient from './IdentifyClient';

export const metadata: Metadata = {
  title: 'Identify Parts & Minifigs | Brick Party',
  description:
    'Upload a photo or enter a part number to identify LEGO pieces and find sets they appear in',
};

export default async function IdentifyPage() {
  const { userId } = await getSupabaseSession();

  if (!userId) {
    return (
      <IdentifyClient
        initialQuota={{ status: 'unauthorized' }}
        isAuthenticated={false}
      />
    );
  }

  // Fetch entitlements and usage in parallel — both only need userId.
  // For unlimited-tier users the usage result is discarded, but the
  // parallelism saves more time than the redundant DB read costs.
  const [entitlements, usage] = await Promise.all([
    getEntitlements(userId),
    getUsageStatus({
      userId,
      featureKey: 'identify:daily',
      windowKind: 'daily',
      limit: 5,
    }),
  ]);

  if (entitlements.features.includes('identify.unlimited')) {
    return (
      <IdentifyClient
        initialQuota={{ status: 'unlimited', tier: entitlements.tier }}
        isAuthenticated
      />
    );
  }

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
