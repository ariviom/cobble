'use client';

import { useCallback, useState } from 'react';

type RedeemState = {
  redeem: (code: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  success: boolean;
};

export function useRedeemPromo(): RedeemState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const redeem = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/billing/redeem-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(data.message || 'Invalid promo code.');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { redeem, loading, error, success };
}
