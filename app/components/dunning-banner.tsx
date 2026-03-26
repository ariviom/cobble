'use client';

import { Button } from '@/app/components/ui/Button';
import { usePortalSession } from '@/app/hooks/usePortalSession';

type Props = {
  subscriptionStatus: string | null;
};

export function DunningBanner({ subscriptionStatus }: Props) {
  const { openPortal, loading, error } = usePortalSession();

  if (subscriptionStatus !== 'past_due') return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-warning-muted px-4 py-2 text-sm text-warning">
      <span>
        Your payment failed — update your payment method to keep Plus features.
      </span>
      <Button
        onClick={openPortal}
        disabled={loading}
        size="xs"
        className="shrink-0 bg-warning text-white hover:opacity-90"
      >
        {loading ? 'Loading...' : 'Update Payment'}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
