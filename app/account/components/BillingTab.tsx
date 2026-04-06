'use client';

import { Alert } from '@/app/components/ui/Alert';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { PromoCodeInput } from '@/app/components/PromoCodeInput';
import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { usePortalSession } from '@/app/hooks/usePortalSession';
import { useCallback, useState } from 'react';
import type { Tables } from '@/supabase/types';

type BillingSubscriptionRow = Tables<'billing_subscriptions'>;

type BillingTabProps = {
  subscription: BillingSubscriptionRow | null;
};

type SubscriptionState =
  | 'free'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

function getSubscriptionState(
  subscription: BillingSubscriptionRow | null
): SubscriptionState {
  if (!subscription) return 'free';
  const status = subscription.status;
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return 'active';
  if (status === 'past_due') return 'past_due';
  if (status === 'canceled') return 'canceled';
  // Treat unpaid, incomplete, incomplete_expired as free
  return 'free';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function PlanBadge({
  label,
  variant,
}: {
  label: string;
  variant: 'free' | 'plus' | 'warning';
}) {
  const baseClasses =
    'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold';
  const variantClasses = {
    free: 'bg-background-muted text-foreground-muted',
    plus: 'bg-success-muted text-success',
    warning: 'bg-warning-muted text-warning',
  };
  return (
    <span className={`${baseClasses} ${variantClasses[variant]}`}>{label}</span>
  );
}

export function BillingTab({ subscription }: BillingTabProps) {
  const {
    openPortal,
    loading: portalLoading,
    error: portalError,
  } = usePortalSession();
  const { tier } = useEntitlements();
  const [promoRedeemed, setPromoRedeemed] = useState(false);
  const handlePromoSuccess = useCallback(() => setPromoRedeemed(true), []);
  const state = promoRedeemed ? 'active' : getSubscriptionState(subscription);

  const effectiveTier = promoRedeemed ? 'plus' : tier;
  const tierLabel =
    effectiveTier === 'plus' || effectiveTier === 'pro' ? 'Plus' : 'Free';

  return (
    <div className="space-y-6">
      {/* Past Due Warning */}
      {state === 'past_due' && (
        <Alert variant="warning" title="Action needed">
          Add a payment method to continue using Plus features.
        </Alert>
      )}

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          {state === 'free' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PlanBadge label="Free Plan" variant="free" />
              </div>
              <p className="text-sm text-foreground-muted">
                You are on the Free plan. Upgrade to Plus for unlimited tabs,
                custom lists, part identification, and more.
              </p>
              <Button href="/pricing" variant="primary" size="sm">
                Upgrade to Plus
              </Button>
              <PromoCodeInput onSuccess={handlePromoSuccess} />
            </div>
          )}

          {state === 'trialing' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PlanBadge label="Plus (Trial)" variant="plus" />
              </div>
              <p className="text-sm text-foreground-muted">
                Your free trial ends on{' '}
                <span className="font-medium text-foreground">
                  {formatDate(subscription?.current_period_end ?? null)}
                </span>
                . You&apos;ll be billed automatically when the trial ends.
              </p>
              <Button
                onClick={openPortal}
                disabled={portalLoading}
                variant="secondary"
                size="sm"
              >
                {portalLoading ? 'Loading...' : 'Manage Subscription'}
              </Button>
            </div>
          )}

          {state === 'active' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PlanBadge label={tierLabel} variant="plus" />
              </div>
              {subscription?.cancel_at_period_end || subscription?.cancel_at ? (
                <p className="text-sm text-foreground-muted">
                  Your subscription is good through{' '}
                  <span className="font-medium text-foreground">
                    {formatDate(
                      subscription.cancel_at ??
                        subscription.current_period_end ??
                        null
                    )}
                  </span>
                  . It won&apos;t renew after that.
                </p>
              ) : (
                <p className="text-sm text-foreground-muted">
                  Your subscription renews on{' '}
                  <span className="font-medium text-foreground">
                    {formatDate(subscription?.current_period_end ?? null)}
                  </span>
                  .
                </p>
              )}
              <Button
                onClick={openPortal}
                disabled={portalLoading}
                variant="secondary"
                size="sm"
              >
                {portalLoading ? 'Loading...' : 'Manage Subscription'}
              </Button>
            </div>
          )}

          {state === 'past_due' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PlanBadge label={tierLabel} variant="warning" />
              </div>
              <p className="text-sm text-foreground-muted">
                A payment method is needed to continue using Plus features.
              </p>
              <Button
                onClick={openPortal}
                disabled={portalLoading}
                variant="primary"
                size="sm"
              >
                {portalLoading ? 'Loading...' : 'Update Payment Method'}
              </Button>
            </div>
          )}

          {state === 'canceled' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PlanBadge label="Free Plan" variant="free" />
              </div>
              <p className="text-sm text-foreground-muted">
                Your Brick Party Plus subscription ended on{' '}
                <span className="font-medium text-foreground">
                  {formatDate(subscription?.current_period_end ?? null)}
                </span>
                .
              </p>
              <Button href="/pricing" variant="primary" size="sm">
                Resubscribe
              </Button>
            </div>
          )}

          {portalError && (
            <p className="mt-4 text-sm text-red-600">{portalError}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
