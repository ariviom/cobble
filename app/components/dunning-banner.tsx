'use client';

import { usePortalSession } from '@/app/hooks/usePortalSession';
import { useEffect, useRef } from 'react';

type Props = {
  subscriptionStatus: string | null;
};

export function DunningBanner({ subscriptionStatus }: Props) {
  const { openPortal, loading, error } = usePortalSession();
  const ref = useRef<HTMLDivElement>(null);
  const visible = subscriptionStatus === 'past_due';

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.setProperty(
        '--spacing-dunning-height',
        '0px'
      );
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight;
      document.documentElement.style.setProperty(
        '--spacing-dunning-height',
        `${h}px`
      );
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty(
        '--spacing-dunning-height',
        '0px'
      );
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 top-0 z-[101] flex items-center justify-center gap-3 border-b border-warning bg-warning-muted px-4 py-2 text-sm text-foreground"
    >
      <span>
        Add a payment method to keep your Plus features.{' '}
        <button
          onClick={openPortal}
          disabled={loading}
          className="font-bold underline hover:opacity-80 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Update Payment'}
        </button>
      </span>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
