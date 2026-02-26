'use client';

import { Alert } from '@/app/components/ui/Alert';
import { buttonVariants } from '@/app/components/ui/Button';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/Tabs';
import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';

import {
  AccountTab,
  BillingTab,
  DisplayTab,
  FeedbackTab,
  SetsTab,
} from './components';
import { useAccountData } from './hooks/useAccountData';

type UserProfileRow = Tables<'user_profiles'>;

type AccountPageClientProps = {
  initialUser: User | null;
  initialProfile: UserProfileRow | null;
  initialPricingCurrency: string;
  initialPricingCountry: string | null;
  initialSyncOwnedMinifigsFromSets: boolean;
  initialSubscription: Tables<'billing_subscriptions'> | null;
};

export default function AccountPageClient({
  initialUser,
  initialProfile,
  initialPricingCurrency,
  initialPricingCountry,
  initialSyncOwnedMinifigsFromSets,
  initialSubscription,
}: AccountPageClientProps) {
  useHydrateUserSets();

  const {
    user,
    profile,
    isLoading,
    error,
    pricingCurrency,
    pricingCountry,
    setUser,
    setProfile,
    setError,
    setPricingCurrency,
    setPricingCountry,
  } = useAccountData({
    initialUser,
    initialProfile,
    initialPricingCurrency,
    initialPricingCountry,
  });

  const isLoggedIn = !!user;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
      <header>
        <h1 className="text-heading-lg font-bold tracking-tight text-foreground">
          Account
        </h1>
        <p className="mt-1 text-body text-foreground-muted">
          Manage your sign-in, profile, and default Brick Party behavior.
        </p>
      </header>

      {!isLoading && !isLoggedIn && (
        <Alert variant="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              You are not logged in. Sign in to manage your account settings and
              sync data across devices.
            </span>
            <Link
              href="/login"
              className={buttonVariants({ variant: 'primary', size: 'sm' })}
            >
              Sign in
            </Link>
          </div>
        </Alert>
      )}

      {error && <ErrorBanner message={error} />}

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="display">Display</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="sets">Your sets</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="account">
          <AccountTab
            user={user}
            profile={profile}
            setUser={setUser}
            setProfile={setProfile}
            setError={setError}
          />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab subscription={initialSubscription} />
        </TabsContent>

        <TabsContent value="display">
          <DisplayTab
            user={user}
            profile={profile}
            setProfile={setProfile}
            setError={setError}
            pricingCurrency={pricingCurrency}
            pricingCountry={pricingCountry}
            setPricingCurrency={setPricingCurrency}
            setPricingCountry={setPricingCountry}
          />
        </TabsContent>

        <TabsContent value="sets">
          <SetsTab
            user={user}
            initialSyncOwnedMinifigsFromSets={initialSyncOwnedMinifigsFromSets}
          />
        </TabsContent>

        <TabsContent value="feedback">
          <FeedbackTab user={user} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
