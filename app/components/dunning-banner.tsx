'use client';

import { useCallback, useState } from 'react';

type Props = {
  subscriptionStatus: string | null;
};

export function DunningBanner({ subscriptionStatus }: Props) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = useCallback(async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  if (subscriptionStatus !== 'past_due') return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
      <span>
        Your payment failed — update your payment method to keep Plus features.
      </span>
      <button
        onClick={openPortal}
        disabled={portalLoading}
        className="shrink-0 rounded-md bg-amber-800 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
      >
        {portalLoading ? 'Loading...' : 'Update Payment'}
      </button>
      {error && (
        <span className="text-xs text-red-700 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
