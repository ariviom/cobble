'use client';

import { LandingNav } from '@/app/components/landing/LandingNav';
import { PricingSection } from '@/app/components/landing/PricingSection';
import { PageLayout } from '@/app/components/layout/PageLayout';
import { Button } from '@/app/components/ui/Button';

type Tier = 'free' | 'plus' | 'pro';

type Props = {
  tier: Tier;
  isAuthenticated: boolean;
  subscriptionStatus: string | null;
  hadPriorSubscription: boolean;
  plusMonthlyPriceId: string;
  plusYearlyPriceId: string;
};

function PricingContent({
  tier,
  isAuthenticated,
  subscriptionStatus,
  hadPriorSubscription,
  plusMonthlyPriceId,
  plusYearlyPriceId,
}: Props) {
  return (
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
        isAuthenticated={isAuthenticated}
        tier={tier}
        subscriptionStatus={subscriptionStatus}
        hadPriorSubscription={hadPriorSubscription}
        plusMonthlyPriceId={plusMonthlyPriceId}
        plusYearlyPriceId={plusYearlyPriceId}
      />

      {/* Footer links */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {!isAuthenticated && (
          <Button href="/" variant="outline" size="sm">
            Back to home
          </Button>
        )}
        {isAuthenticated && (
          <Button href="/account" variant="ghost" size="sm">
            Go to account
          </Button>
        )}
      </div>
    </div>
  );
}

export function PricingPageClient(props: Props) {
  if (props.isAuthenticated) {
    return (
      <PageLayout>
        <PricingContent {...props} />
      </PageLayout>
    );
  }

  return (
    <>
      <LandingNav />
      <main>
        <PricingContent {...props} />
      </main>
    </>
  );
}
