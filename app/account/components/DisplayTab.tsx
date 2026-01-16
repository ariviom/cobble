'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { Switch } from '@/app/components/ui/Switch';
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
        bgClass: 'bg-brand-blue',
      },
      {
        label: 'Yellow',
        value: 'yellow' as const,
        bgClass: 'bg-brand-yellow',
      },
      {
        label: 'Purple',
        value: 'purple' as const,
        bgClass: 'bg-brand-purple',
      },
      {
        label: 'Red',
        value: 'red' as const,
        bgClass: 'bg-brand-red',
      },
      {
        label: 'Green',
        value: 'green' as const,
        bgClass: 'bg-brand-green',
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
    <div className="space-y-6">
      {/* Sharing Section */}
      <Card>
        <CardHeader>
          <CardTitle>Sharing</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Control who can see your lists and how your public profile link
            works.
          </p>

          <div className="mt-6 space-y-6">
            {/* Public lists toggle */}
            <div>
              <label className="text-label font-semibold text-foreground">
                Public lists
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                When enabled, your wishlist and custom lists can be viewed by
                anyone with your public link. Owned quantities are never shared.
              </p>
              <div className="mt-3">
                <Switch
                  checked={listsPublic}
                  onChange={() => void handleToggleListsPublic()}
                  disabled={!isLoggedIn || isSavingListsPublic}
                  label={listsPublic ? 'Public' : 'Private'}
                />
              </div>
            </div>

            {/* Public profile link */}
            <div>
              <label className="text-label font-semibold text-foreground">
                Public profile link
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Share this link so others can see your wishlist and lists. Only
                works when public lists are enabled.
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  type="text"
                  size="sm"
                  readOnly
                  value={publicUrl ?? ''}
                  placeholder={
                    publicPath ?? 'Set a username to generate a link'
                  }
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!publicUrl}
                  onClick={() => {
                    if (!publicUrl) return;
                    void navigator.clipboard?.writeText(publicUrl);
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Theme Section */}
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Preferences sync per account when signed in, or stay on this device
            otherwise.
          </p>

          <div className="mt-6 space-y-6">
            {/* Appearance */}
            <div>
              <label className="text-label font-semibold text-foreground">
                Appearance
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Choose between light, dark, or system preference.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {themeOptions.map(option => {
                  const isActive = selectedTheme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      disabled={isThemeLoading}
                      onClick={() => updateTheme(option.value)}
                      className={`rounded-md border-2 px-4 py-2 text-sm font-semibold transition-all duration-150 focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:outline-none ${
                        isActive
                          ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                          : 'border-subtle text-foreground-muted hover:border-strong hover:text-foreground'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent color */}
            <div>
              <label className="text-label font-semibold text-foreground">
                Accent color
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Choose Brick Party&apos;s primary accent color.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {themeColorOptions.map(option => {
                  const isActive = selectedThemeColor === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      disabled={isThemeLoading}
                      onClick={() => updateThemeColor(option.value)}
                      className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:outline-none ${
                        isActive
                          ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                          : 'border-subtle text-foreground-muted hover:border-strong hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full ${option.bgClass}`}
                        aria-hidden="true"
                      />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Defaults Section */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            How to show parts when you first open a set.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <label className="text-label font-semibold text-foreground">
                Default inventory view
              </label>
              <div className="mt-2 flex gap-2">
                <Button type="button" size="sm" variant="secondary">
                  List
                </Button>
                <Button type="button" size="sm" variant="secondary">
                  Grid
                </Button>
              </div>
            </div>

            <div>
              <label className="text-label font-semibold text-foreground">
                Default filter
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Choose whether to start on All, Missing, or Owned.
              </p>
              <Select size="sm" className="mt-2">
                <option>All parts</option>
                <option>Missing parts</option>
                <option>Owned parts</option>
              </Select>
            </div>

            <div>
              <label className="text-label font-semibold text-foreground">
                Default tile size
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Controls the default size of parts in grid view.
              </p>
              <Select size="sm" className="mt-2">
                <option>Medium</option>
                <option>Small</option>
                <option>Large</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Section */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; currency</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Configure BrickLink price lookups and display preferences.
          </p>

          <div className="mt-6 space-y-6">
            <div>
              <label className="text-label font-semibold text-foreground">
                Currency
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Currency for BrickLink price lookups. Defaults to USD.
              </p>
              <Select
                size="sm"
                className="mt-2"
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

            <div>
              <label className="text-label font-semibold text-foreground">
                Seller region
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Limit BrickLink prices to sellers in a single country, or use
                worldwide data.
              </p>
              <Select
                size="sm"
                className="mt-2"
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

            <div>
              <label className="text-label font-semibold text-foreground">
                Pricing display
              </label>
              <p className="text-body-sm mt-0.5 text-foreground-muted">
                Control how BrickLink prices are derived and shown.
              </p>
              <Select size="sm" className="mt-2">
                <option>Price range (min–max of current listings)</option>
                <option>Average price (current listings)</option>
                <option>Average price (last 6 months sold)</option>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border-2 border-subtle bg-card-muted p-4">
              <p className="text-body-sm text-foreground-muted">
                Applies to future BrickLink price lookups.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!isLoggedIn || isSavingPricing}
                onClick={() => void handleSavePricingPreferences()}
              >
                {isSavingPricing ? 'Saving…' : 'Save pricing'}
              </Button>
            </div>

            {pricingError && (
              <p className="text-body-sm font-medium text-danger">
                {pricingError}
              </p>
            )}
            {pricingMessage && !pricingError && (
              <p className="text-body-sm font-medium text-success">
                {pricingMessage}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
