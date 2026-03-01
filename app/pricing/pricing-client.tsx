'use client';

import { PricingSection } from '@/app/components/landing/PricingSection';
import { PageLayout } from '@/app/components/layout/PageLayout';

type Tier = 'free' | 'plus' | 'pro';

type Props = {
  tier: Tier;
  isAuthenticated: boolean;
  subscriptionStatus: string | null;
  hadPriorSubscription: boolean;
  plusMonthlyPriceId: string;
  plusYearlyPriceId: string;
};

export function PricingPageClient(props: Props) {
  return (
    <PageLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-12 sm:px-6">
        {/* Header */}
        <header className="space-y-3 text-center">
          <h1 className="text-page-title">Pick the plan that fits</h1>
          <p className="text-body text-foreground-muted">
            Everything you need to track LEGO sets is free. Upgrade to Plus for
            unlimited power.
          </p>
        </header>

        <PricingSection
          isAuthenticated={props.isAuthenticated}
          tier={props.tier}
          subscriptionStatus={props.subscriptionStatus}
          hadPriorSubscription={props.hadPriorSubscription}
          plusMonthlyPriceId={props.plusMonthlyPriceId}
          plusYearlyPriceId={props.plusYearlyPriceId}
        />
      </div>
    </PageLayout>
  );
}
