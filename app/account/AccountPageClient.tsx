'use client';

import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useState } from 'react';

import { AccountTab, DisplayTab, FeedbackTab, SetsTab } from './components';
import { useAccountData } from './hooks/useAccountData';

type UserProfileRow = Tables<'user_profiles'>;

type AccountPageClientProps = {
  initialUser: User | null;
  initialProfile: UserProfileRow | null;
  initialPricingCurrency: string;
  initialPricingCountry: string | null;
  initialSyncOwnedMinifigsFromSets: boolean;
};

type TabId = 'account' | 'display' | 'sets' | 'feedback';

const TABS: { id: TabId; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'display', label: 'Display & behavior' },
  { id: 'sets', label: 'Your sets' },
  { id: 'feedback', label: 'Feedback' },
];

export default function AccountPageClient({
  initialUser,
  initialProfile,
  initialPricingCurrency,
  initialPricingCountry,
  initialSyncOwnedMinifigsFromSets,
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

  const [activeTab, setActiveTab] = useState<TabId>('account');

  const isLoggedIn = !!user;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 lg:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Manage your sign-in, profile, and default Brick Party behavior.
        </p>
      </header>

      {!isLoading && !isLoggedIn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              You are not logged in. To manage your account settings and sync
              data in the future, sign in first.
            </p>
            <Link
              href="/login"
              className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-800"
            >
              Go to login
            </Link>
          </div>
        </div>
      )}

      {error && <ErrorBanner className="text-xs" message={error} />}

      {/* Tab navigation */}
      <nav className="border-b border-subtle">
        <div className="flex gap-4 overflow-x-auto px-1 pb-2 text-xs font-medium">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={
                activeTab === tab.id
                  ? 'border-b-2 border-theme-primary pb-1 text-theme-primary'
                  : 'border-b-2 border-transparent pb-1 text-foreground-muted hover:text-foreground'
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      {activeTab === 'account' && (
        <AccountTab
          user={user}
          profile={profile}
          setUser={setUser}
          setProfile={setProfile}
          setError={setError}
        />
      )}

      {activeTab === 'display' && (
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
      )}

      {activeTab === 'sets' && (
        <SetsTab
          user={user}
          initialSyncOwnedMinifigsFromSets={initialSyncOwnedMinifigsFromSets}
        />
      )}

      {activeTab === 'feedback' && <FeedbackTab user={user} />}
    </div>
  );
}
