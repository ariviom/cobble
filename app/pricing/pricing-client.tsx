'use client';

import { Button } from '@/app/components/ui/Button';
import { Check, Minus } from 'lucide-react';
import { useState } from 'react';

type Tier = 'free' | 'plus' | 'pro';

type Props = {
  tier: Tier;
  isAuthenticated: boolean;
  subscriptionStatus: string | null;
  hadPriorSubscription: boolean;
  plusMonthlyPriceId: string;
};

type Feature = {
  name: string;
  free: string;
  plus: string;
};

const features: Feature[] = [
  { name: 'Search & browse sets', free: 'Unlimited', plus: 'Unlimited' },
  { name: 'Track owned pieces', free: 'Unlimited', plus: 'Unlimited' },
  { name: 'BrickLink pricing', free: 'Included', plus: 'Included' },
  { name: 'Export to CSV', free: 'Unlimited', plus: 'Unlimited' },
  { name: 'Open tabs', free: '3', plus: 'Unlimited' },
  { name: 'Custom lists', free: '5', plus: 'Unlimited' },
  { name: 'Identify parts', free: '5/day', plus: 'Unlimited' },
  { name: 'Host Search Party', free: '2/month', plus: 'Unlimited' },
  { name: 'Part rarity insights', free: '', plus: 'Included' },
  { name: 'Cloud sync', free: '', plus: 'Included' },
];

function FeatureValue({ value }: { value: string }) {
  if (value === '') {
    return (
      <span className="flex items-center justify-center text-neutral-400">
        <Minus className="h-4 w-4" />
      </span>
    );
  }
  if (value === 'Unlimited' || value === 'Included') {
    return (
      <span className="flex items-center justify-center gap-1.5 font-medium text-success">
        <Check className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">{value}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center font-medium text-foreground">
      {value}
    </span>
  );
}

export function PricingPageClient({
  tier,
  isAuthenticated,
  subscriptionStatus,
  hadPriorSubscription,
  plusMonthlyPriceId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActiveSubscription =
    subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isCanceledOrPastDue =
    subscriptionStatus === 'canceled' || subscriptionStatus === 'past_due';

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: plusMonthlyPriceId }),
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
      setLoading(false);
    }
  };

  function renderFreeCta() {
    if (!isAuthenticated) {
      return (
        <Button href="/signup" variant="outline" className="w-full">
          Sign up free
        </Button>
      );
    }
    if (tier === 'free' && !isActiveSubscription) {
      return (
        <span className="inline-flex w-full items-center justify-center rounded-md border-2 border-subtle bg-card-muted px-4 py-2.5 text-base font-semibold text-foreground-muted">
          Current plan
        </span>
      );
    }
    return null;
  }

  function renderPlusCta() {
    if (!isAuthenticated) {
      return (
        <Button href="/signup" variant="primary" className="w-full">
          Get started with Plus
        </Button>
      );
    }
    if (isActiveSubscription && (tier === 'plus' || tier === 'pro')) {
      return (
        <span className="inline-flex w-full items-center justify-center rounded-md border-2 border-success bg-success-muted px-4 py-2.5 text-base font-semibold text-success">
          Current plan
        </span>
      );
    }
    if (isCanceledOrPastDue) {
      return (
        <Button
          onClick={handleCheckout}
          disabled={loading}
          variant="primary"
          className="w-full"
        >
          {loading ? 'Redirecting...' : 'Resubscribe'}
        </Button>
      );
    }
    // Free tier, signed in, no active subscription
    return (
      <Button
        onClick={handleCheckout}
        disabled={loading}
        variant="primary"
        className="w-full"
      >
        {loading
          ? 'Redirecting...'
          : hadPriorSubscription
            ? 'Get Plus'
            : 'Start 14-day free trial'}
      </Button>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6">
      {/* Header */}
      <header className="space-y-3 text-center">
        <h1 className="text-page-title">Pick the plan that fits</h1>
        <p className="text-body text-foreground-muted">
          Everything you need to track LEGO sets is free. Upgrade to Plus for
          unlimited power.
        </p>
      </header>

      {/* Plan cards (mobile) / Feature table (desktop) */}
      <div className="flex flex-col gap-8">
        {/* Feature comparison table */}
        <div className="overflow-hidden rounded-xl border border-subtle bg-card shadow-md">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_minmax(80px,120px)_minmax(80px,120px)] border-b border-subtle sm:grid-cols-[1fr_140px_140px]">
            <div className="px-4 py-4 sm:px-6">
              <span className="text-sm font-semibold text-foreground-muted">
                Feature
              </span>
            </div>
            <div className="flex flex-col items-center justify-center border-l border-subtle px-3 py-4 text-center">
              <span className="text-sm font-bold text-foreground">Free</span>
              <span className="mt-0.5 text-2xs text-foreground-muted">
                $0/mo
              </span>
            </div>
            <div className="flex flex-col items-center justify-center border-l border-subtle bg-info-muted px-3 py-4 text-center">
              <span className="text-sm font-bold text-info">Plus</span>
              <span className="mt-0.5 text-2xs font-medium text-info">
                $8/mo
              </span>
            </div>
          </div>

          {/* Feature rows */}
          {features.map((feature, i) => (
            <div
              key={feature.name}
              className={`grid grid-cols-[1fr_minmax(80px,120px)_minmax(80px,120px)] sm:grid-cols-[1fr_140px_140px] ${
                i < features.length - 1 ? 'border-b border-subtle' : ''
              }`}
            >
              <div className="flex items-center px-4 py-3 text-sm text-foreground sm:px-6">
                {feature.name}
              </div>
              <div className="flex items-center justify-center border-l border-subtle px-3 py-3 text-sm">
                <FeatureValue value={feature.free} />
              </div>
              <div className="flex items-center justify-center border-l border-subtle bg-info-muted/50 px-3 py-3 text-sm">
                <FeatureValue value={feature.plus} />
              </div>
            </div>
          ))}
        </div>

        {/* CTA row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Free tier card */}
          <div className="flex flex-col gap-4 rounded-xl border border-subtle bg-card p-6 shadow-sm">
            <div>
              <h2 className="text-card-title text-foreground">Free</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Search, track, and export -- no account required.
              </p>
            </div>
            <div className="mt-auto">{renderFreeCta()}</div>
          </div>

          {/* Plus tier card */}
          <div className="relative flex flex-col gap-4 rounded-xl border-2 border-info bg-card p-6 shadow-md">
            <div className="absolute -top-3 right-4 rounded-full bg-info px-3 py-0.5 text-2xs font-bold text-white">
              RECOMMENDED
            </div>
            <div>
              <h2 className="text-card-title text-info">Plus</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Unlimited everything, cloud sync, and part rarity.
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground">
                $8
                <span className="text-sm font-normal text-foreground-muted">
                  /month
                </span>
              </p>
            </div>
            <div className="mt-auto">
              {renderPlusCta()}
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Footer links */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button href="/" variant="outline" size="sm">
          Back to app
        </Button>
        {isAuthenticated && (
          <Button href="/account" variant="ghost" size="sm">
            Go to account
          </Button>
        )}
      </div>
    </main>
  );
}
