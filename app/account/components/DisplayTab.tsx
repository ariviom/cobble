'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { useOrigin } from '@/app/hooks/useOrigin';
import { useTheme } from '@/app/hooks/useTheme';
import {
  BRICKLINK_COUNTRY_OPTIONS,
  BRICKLINK_CURRENCY_OPTIONS,
} from '@/app/lib/pricing';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { saveUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { buildUserHandle } from '@/app/lib/users';
import type { User } from '@supabase/supabase-js';
import { useMemo, useState } from 'react';

import type { UserId, UserProfileRow } from '../hooks/useAccountData';

type DisplayTabProps = {
  user: User | null;
  profile: UserProfileRow | null;
  setProfile: (profile: UserProfileRow | null) => void;
  setError: (error: string | null) => void;
  pricingCurrency: string;
  pricingCountry: string | null;
  setPricingCurrency: (currency: string) => void;
  setPricingCountry: (country: string | null) => void;
};

export function DisplayTab({
  user,
  profile,
  setProfile,
  setError,
  pricingCurrency,
  pricingCountry,
  setPricingCurrency,
  setPricingCountry,
}: DisplayTabProps) {
  const isLoggedIn = !!user;
  const origin = useOrigin();

  // Lists public toggle
  const [listsPublic, setListsPublic] = useState(
    profile?.lists_public ?? false
  );
  const [isSavingListsPublic, setIsSavingListsPublic] = useState(false);

  // Pricing state
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);

  // Theme
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

  const publicHandle =
    profile &&
    buildUserHandle({ user_id: profile.user_id, username: profile.username });
  const publicPath = publicHandle ? `/user/${publicHandle}` : null;
  const publicUrl = publicPath ? `${origin || ''}${publicPath}` : null;

  const handleToggleListsPublic = async () => {
    if (!user || !profile) return;

    const supabase = getSupabaseBrowserClient();
    const next = !listsPublic;
    setIsSavingListsPublic(true);
    setError(null);
    setListsPublic(next);

    try {
      const { data, error: updateError } = await supabase
        .from('user_profiles')
        .update({ lists_public: next })
        .eq('user_id', user.id as UserId)
        .select('*')
        .maybeSingle();

      if (updateError) {
        setError('Failed to update sharing settings.');
        setListsPublic(prev => !prev);
        return;
      }

      if (data) {
        setProfile(data);
        setListsPublic(data.lists_public ?? false);
      }
    } finally {
      setIsSavingListsPublic(false);
    }
  };

  const handleSavePricingPreferences = async () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    setPricingError(null);
    setPricingMessage(null);
    setIsSavingPricing(true);
    try {
      await saveUserPricingPreferences(supabase, user.id, {
        currencyCode: pricingCurrency,
        countryCode: pricingCountry,
      });
      setPricingMessage('Saved pricing preferences.');
    } catch (err) {
      setPricingError('Failed to save pricing preferences.');
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.error('AccountPage: failed to save pricing preferences', {
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {}
      }
    } finally {
      setIsSavingPricing(false);
    }
  };

  return (
    <Card
      id="account-preferences-section"
      aria-labelledby="account-preferences-heading"
      className="border-none bg-transparent p-0 shadow-none"
    >
      <CardContent className="flex flex-col gap-6">
        <div>
          <CardTitle
            id="account-preferences-heading"
            className="text-xl font-semibold text-foreground"
          >
            Display &amp; behavior
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-foreground-muted">
            Control how Brick Party behaves by default. These settings will be
            stored per account once authentication is wired up.
          </CardDescription>
        </div>

        <div className="mt-4 space-y-8">
          {/* Sharing */}
          <div className="flex flex-col gap-3 border-t border-subtle pt-4">
            <h3 className="text-sm font-semibold text-foreground">Sharing</h3>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-foreground-muted">
                Control who can see your lists and how your public profile link
                works.
              </p>
              <div className="mt-2 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-foreground">
                    Public lists
                  </label>
                  <p className="text-xs text-foreground-muted">
                    When enabled, your wishlist and custom lists can be viewed
                    by anyone with your public link. Owned quantities are never
                    shared.
                  </p>
                  <div className="mt-2 inline-flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={listsPublic}
                      onClick={() => void handleToggleListsPublic()}
                      disabled={!isLoggedIn || isSavingListsPublic}
                      className={`inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors ${
                        listsPublic
                          ? 'border-emerald-500 bg-emerald-500'
                          : 'border-subtle bg-background-muted'
                      } disabled:opacity-50`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full bg-card shadow transition-transform ${
                          listsPublic ? 'translate-x-3.5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className="text-xs text-foreground-muted">
                      {listsPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-foreground">
                    Public profile link
                  </label>
                  <p className="text-xs text-foreground-muted">
                    Share this link so others can see your wishlist and lists.
                    It will only work when public lists are enabled.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="text"
                      readOnly
                      value={publicUrl ?? ''}
                      placeholder={
                        publicPath ?? 'Set a username to generate a link'
                      }
                      className="flex-1 text-xs text-foreground-muted"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!publicUrl}
                      onClick={() => {
                        if (!publicUrl) return;
                        void navigator.clipboard?.writeText(publicUrl);
                      }}
                      className="inline-flex items-center px-2 py-1 text-[11px]"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Theme */}
          <div className="flex flex-col gap-3 border-t border-subtle pt-4">
            <h3 className="text-sm font-semibold text-foreground">Theme</h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Appearance
                </label>
                <p className="text-xs text-foreground-muted">
                  Light / dark / system. Preferences sync per account when
                  signed in, or stay on this device otherwise.
                </p>
                <div className="mt-1 inline-flex gap-2 text-xs">
                  {themeOptions.map(option => {
                    const isActive = selectedTheme === option.value;
                    const baseClasses =
                      'rounded-md border px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-primary';
                    const activeClasses =
                      'border-theme-primary bg-theme-primary/10 text-theme-primary';
                    const inactiveClasses =
                      'border-subtle text-foreground-muted hover:border-strong';
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
                <label className="text-[11px] font-medium text-foreground">
                  Accent color
                </label>
                <p className="text-xs text-foreground-muted">
                  Choose Brick Party&apos;s primary accent color. These map to
                  the brand colors defined in the global theme.
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
            </div>
          </div>

          {/* Defaults */}
          <div className="flex flex-col gap-3 border-t border-subtle pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              Inventory defaults
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Default inventory view
                </label>
                <p className="text-xs text-foreground-muted">
                  How to show parts when you first open a set.
                </p>
                <div className="mt-1 inline-flex gap-2 text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="px-2 py-1"
                  >
                    List
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="px-2 py-1"
                  >
                    Grid
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Default filter
                </label>
                <p className="text-xs text-foreground-muted">
                  Choose whether to start on All, Missing, Owned, or a specific
                  category tab.
                </p>
                <Select className="mt-1 w-full text-xs">
                  <option>All parts</option>
                  <option>Missing parts</option>
                  <option>Owned parts</option>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Default tile size
                </label>
                <p className="text-xs text-foreground-muted">
                  Controls the default size of parts in grid view.
                </p>
                <Select className="mt-1 w-full text-xs">
                  <option>Medium</option>
                  <option>Small</option>
                  <option>Large</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="flex flex-col gap-3 border-t border-subtle pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              Pricing &amp; currency
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Currency
                </label>
                <p className="text-xs text-foreground-muted">
                  Currency for BrickLink price lookups. Defaults to USD for new
                  accounts.
                </p>
                <Select
                  className="mt-1 w-full text-xs"
                  value={pricingCurrency}
                  onChange={event => setPricingCurrency(event.target.value)}
                  disabled={!isLoggedIn}
                >
                  {BRICKLINK_CURRENCY_OPTIONS.map(option => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Seller region
                </label>
                <p className="text-xs text-foreground-muted">
                  Limit BrickLink prices to sellers in a single country, or use
                  worldwide data.
                </p>
                <Select
                  className="mt-1 w-full text-xs"
                  value={pricingCountry ?? ''}
                  onChange={event => {
                    const value = event.target.value;
                    setPricingCountry(value === '' ? null : value);
                  }}
                  disabled={!isLoggedIn}
                >
                  {BRICKLINK_COUNTRY_OPTIONS.map(option => (
                    <option
                      key={option.code ?? 'GLOBAL'}
                      value={option.code ?? ''}
                    >
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-foreground-muted">
                  Applies to future BrickLink price lookups.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!isLoggedIn || isSavingPricing}
                  onClick={() => void handleSavePricingPreferences()}
                >
                  {isSavingPricing ? 'Saving…' : 'Save pricing'}
                </Button>
              </div>
              {pricingError && (
                <p className="text-destructive mt-1 text-[11px]">
                  {pricingError}
                </p>
              )}
              {pricingMessage && !pricingError && (
                <p className="mt-1 text-[11px] text-foreground-muted">
                  {pricingMessage}
                </p>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">
                  Pricing display
                </label>
                <p className="text-xs text-foreground-muted">
                  Control how BrickLink prices are derived and shown. BrickLink
                  exposes separate guides for current stock vs last 6 months of
                  sales; we&apos;ll map these options to those guides when
                  pricing is wired up.
                </p>
                <Select className="mt-1 w-full text-xs">
                  <option>Price range (min–max of current listings)</option>
                  <option>Average price (current listings)</option>
                  <option>Average price (last 6 months sold)</option>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
