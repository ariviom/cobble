'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useTheme } from '@/app/hooks/useTheme';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Enums, Tables } from '@/supabase/types';

type UserProfileRow = Tables<'user_profiles'>;

type DbSetStatus = Enums<'set_status'>;

type SetCounts = {
  owned: number;
  wishlist: number;
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setCounts, setSetCounts] = useState<SetCounts | null>(null);
  const {
    theme: selectedTheme,
    setTheme: updateTheme,
    themeColor: selectedThemeColor,
    setThemeColor: updateThemeColor,
    isLoading: isThemeLoading,
  } = useTheme();

  const themeOptions = useMemo(
    () => [
      { label: 'System', value: 'system' as const },
      { label: 'Light', value: 'light' as const },
      { label: 'Dark', value: 'dark' as const },
    ],
    []
  );

  const themeColorOptions = useMemo(
    () => [
      {
        label: 'Blue',
        value: 'blue' as const,
        swatchClass: 'bg-[var(--color-brand-blue)]',
      },
      {
        label: 'Yellow',
        value: 'yellow' as const,
        swatchClass: 'bg-[var(--color-brand-yellow)]',
      },
      {
        label: 'Purple',
        value: 'purple' as const,
        swatchClass: 'bg-[var(--color-brand-purple)]',
      },
      {
        label: 'Red',
        value: 'red' as const,
        swatchClass: 'bg-[var(--color-brand-red)]',
      },
      {
        label: 'Green',
        value: 'green' as const,
        swatchClass: 'bg-[var(--color-brand-green)]',
      },
    ],
    []
  );

  const isLoggedIn = !!user;

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          setError(userError.message);
          setUser(null);
          setProfile(null);
          return;
        }

        if (!user) {
          setUser(null);
          setProfile(null);
            setSetCounts(null);
          return;
        }

        setUser(user);

        const { data: existingProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profileError) {
          setError(profileError.message);
        }

        if (!existingProfile) {
          const displayName =
            (user.user_metadata &&
              (user.user_metadata.full_name as string | undefined)) ||
            user.email ||
            null;

          const { data: createdProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: user.id,
              display_name: displayName,
            })
            .select('*')
            .maybeSingle();

          if (insertError) {
            setError(insertError.message);
          } else if (createdProfile) {
            setProfile(createdProfile);
          }
        } else {
          setProfile(existingProfile);
        }

        // Load basic set counts for this user.
        const { data: sets, error: setsError } = await supabase
          .from('user_sets')
          .select('status')
          .eq('user_id', user.id);

        if (setsError) {
          // Non-fatal; we still show the rest of the account page.
          console.error('Failed to load user_sets for account overview', {
            error: setsError.message,
          });
        } else if (sets) {
          let owned = 0;
          let wishlist = 0;

          for (const row of sets) {
            const status = row.status as DbSetStatus;
            if (status === 'owned') owned += 1;
            else wishlist += 1;
          }

          setSetCounts({ owned, wishlist });
        }
      } catch {
        setError('Failed to load account information.');
        setUser(null);
        setProfile(null);
        setSetCounts(null);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setProfile(null);
    }
  };
  const subscriptionTier =
    profile?.subscription_tier && profile.subscription_tier.length > 0
      ? profile.subscription_tier
      : 'Free';
  const googleEmail = user?.email ?? 'not connected';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 lg:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Manage your sign-in, profile, and default Quarry behavior.
        </p>
      </header>

      {!isLoading && !isLoggedIn && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              You are not logged in. To manage your account settings and sync data
              in the future, sign in first.
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
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
          {error}
        </div>
      )}

      <section
        aria-labelledby="account-auth-heading"
        className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="account-auth-heading"
                className="text-sm font-medium text-foreground"
              >
                Sign-in & identity
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Quarry supports Google Sign-In. Rebrickable and BrickLink are used only as
                data sources, not as login providers.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <p className="text-xs uppercase tracking-wide text-foreground-muted">
                Status
              </p>
              <p className="text-sm font-medium text-foreground">
                {isLoading ? 'Checking…' : isLoggedIn ? 'Signed in' : 'Not signed in'}
              </p>
              {isLoggedIn && (
                <p className="text-[11px] text-foreground-muted">
                  Plan: {subscriptionTier}
                </p>
              )}
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="mt-1 rounded-md border border-neutral-300 bg-background px-2 py-1 text-[11px] text-foreground hover:bg-neutral-50"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">
                Email &amp; password
              </h3>
              <p className="text-xs text-foreground-muted">
                Email/password sign-in will be added later. For now, use Google Sign-In.
              </p>
              <label className="mt-1 text-[11px] font-medium text-foreground">
                Username
              </label>
              <input
                type="text"
                disabled
                placeholder="coming soon"
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
              />
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Email
              </label>
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
              />
              <label className="mt-2 text-[11px] font-medium text-foreground">
                Password
              </label>
              <button
                type="button"
                disabled
                className="mt-1 inline-flex items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500"
              >
                Change password (coming soon)
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-foreground">Google account</h3>
              <p className="text-xs text-foreground-muted">
                When you sign in with Google, your Google email will appear here.
              </p>
              <label className="mt-1 text-[11px] font-medium text-foreground">
                Google email
              </label>
              <input
                type="email"
                disabled
                value={googleEmail}
                className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-700"
              />
              {!isLoggedIn && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                  className="mt-3 inline-flex items-center rounded-md border border-neutral-300 bg-background px-3 py-1.5 text-xs text-foreground hover:bg-neutral-50"
                >
                  Connect Google
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 border-t border-dashed border-neutral-200 pt-3">
            <h3 className="text-xs font-medium text-foreground">
              Rebrickable account (optional)
            </h3>
            <p className="mt-1 text-xs text-foreground-muted">
              In the future you’ll be able to link your Rebrickable account so Quarry
              can read your existing collection (via a Rebrickable user token).
            </p>
            <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Rebrickable user token
                </label>
                <input
                  type="text"
                  disabled
                  placeholder="paste token here (coming soon)"
                  className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled
                  className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500"
                >
                  Connect Rebrickable (coming soon)
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="account-preferences-heading"
        className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="account-preferences-heading"
                className="text-sm font-medium text-foreground"
              >
                Display & behavior
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Control how Quarry behaves by default. These settings will be stored
                per account once authentication is wired up.
              </p>
            </div>
          </div>

          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">Theme</label>
              <p className="text-xs text-foreground-muted">
                Light / dark / system. Preferences sync per account when signed
                in, or stay on this device otherwise.
              </p>
              <div className="mt-1 inline-flex gap-2 text-xs">
                {themeOptions.map(option => {
                  const isActive = selectedTheme === option.value;
                  const baseClasses =
                    'rounded-md border px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary';
                  const activeClasses =
                    'border-theme-primary bg-theme-primary/10 text-theme-primary';
                  const inactiveClasses =
                    'border-neutral-200 text-foreground-muted hover:border-neutral-300';
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`${baseClasses} ${
                        isActive ? activeClasses : inactiveClasses
                      }`}
                      aria-pressed={isActive}
                      disabled={isThemeLoading}
                      onClick={() => updateTheme(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Theme accent color
              </label>
              <p className="text-xs text-foreground-muted">
                Choose Quarry&apos;s primary accent color. These map to the brand
                colors defined in the global theme.
              </p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                {themeColorOptions.map(option => (
                  <label
                    key={option.value}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${
                      selectedThemeColor === option.value
                        ? 'border-theme-primary text-theme-primary'
                        : 'border-transparent text-foreground-muted hover:text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="theme-accent"
                      className="h-3 w-3"
                      checked={selectedThemeColor === option.value}
                      onChange={() => updateThemeColor(option.value)}
                      disabled={isThemeLoading}
                    />
                    <span
                      className={`inline-flex h-3 w-3 rounded-full ${option.swatchClass}`}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Default inventory view
              </label>
              <p className="text-xs text-foreground-muted">
                How to show parts when you first open a set.
              </p>
              <div className="mt-1 inline-flex gap-2 text-xs">
                <button
                  type="button"
                  className="rounded-md border border-neutral-300 px-2 py-1"
                >
                  List
                </button>
                <button
                  type="button"
                  className="rounded-md border border-neutral-200 px-2 py-1"
                >
                  Grid
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Default filter
              </label>
              <p className="text-xs text-foreground-muted">
                Choose whether to start on All, Missing, Owned, or a specific
                category tab.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>All parts</option>
                <option>Missing parts</option>
                <option>Owned parts</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Default tile size
              </label>
              <p className="text-xs text-foreground-muted">
                Controls the default size of parts in grid view.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>Medium</option>
                <option>Small</option>
                <option>Large</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Currency
              </label>
              <p className="text-xs text-foreground-muted">
                Currency for BrickLink price lookups. The API currently uses USD; other
                currencies are placeholders for now.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>USD (current)</option>
                <option disabled>EUR (coming soon)</option>
                <option disabled>GBP (coming soon)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">
                Pricing display
              </label>
              <p className="text-xs text-foreground-muted">
                Control how BrickLink prices are derived and shown. BrickLink exposes
                separate guides for current stock vs last 6 months of sales; we&apos;ll
                map these options to those guides when pricing is wired up.
              </p>
              <select className="mt-1 w-full rounded-md border border-neutral-300 bg-background px-2 py-1 text-xs">
                <option>Price range (min–max of current listings)</option>
                <option>Average price (current listings)</option>
                <option>Average price (last 6 months sold)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="account-sets-heading"
        className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="account-sets-heading"
                className="text-sm font-medium text-foreground"
              >
                Your sets
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Counts of sets you&apos;ve marked as owned or added to your
                wishlist.
              </p>
            </div>
          </div>

          {!isLoggedIn ? (
            <p className="mt-1 text-xs text-foreground-muted">
              Sign in to track your sets across devices.
            </p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Owned
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {setCounts ? setCounts.owned.toLocaleString() : '—'}
                </p>
              </div>
              <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Wishlist
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {setCounts ? setCounts.wishlist.toLocaleString() : '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
