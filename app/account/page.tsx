'use client';

import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/app/components/ui/Card';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { useHydrateUserSets } from '@/app/hooks/useHydrateUserSets';
import { useTheme } from '@/app/hooks/useTheme';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { buildUserHandle, normalizeUsernameCandidate } from '@/app/lib/users';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type UserProfileRow = Tables<'user_profiles'>;

export default function AccountPage() {
  useHydrateUserSets();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [collectionsPublic, setCollectionsPublic] = useState(false);
  const [isSavingCollectionsPublic, setIsSavingCollectionsPublic] =
    useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const {
    theme: selectedTheme,
    setTheme: updateTheme,
    themeColor: selectedThemeColor,
    setThemeColor: updateThemeColor,
    isLoading: isThemeLoading,
  } = useTheme();

  const userSets = useUserSetsStore(state => state.sets);
  const ownedCount = useMemo(
    () =>
      Object.values(userSets).reduce(
        (acc, set) => (set.status.owned ? acc + 1 : acc),
        0
      ),
    [userSets]
  );
  const wishlistCount = useMemo(
    () =>
      Object.values(userSets).reduce(
        (acc, set) => (set.status.wantToBuild ? acc + 1 : acc),
        0
      ),
    [userSets]
  );

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
  const authProvider =
    isLoggedIn && user?.app_metadata
      ? (user.app_metadata.provider as string | null)
      : null;
  const isGoogleAuth = authProvider === 'google';
  const isEmailAuth = authProvider === 'email';
  const [activeTab, setActiveTab] = useState<'account' | 'display' | 'sets'>(
    'account'
  );

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
            setUsernameInput(createdProfile.username ?? '');
            setCollectionsPublic(createdProfile.collections_public ?? false);
          }
        } else {
          setProfile(existingProfile);
          setUsernameInput(existingProfile.username ?? '');
          setCollectionsPublic(existingProfile.collections_public ?? false);
        }
      } catch {
        setError('Failed to load account information.');
        setUser(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const googleEmail = user?.email ?? 'not connected';

  const publicHandle =
    profile &&
    buildUserHandle({ user_id: profile.user_id, username: profile.username });

  const publicPath = publicHandle ? `/user/${publicHandle}` : null;

  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const publicUrl = publicPath ? `${origin || ''}${publicPath}` : null;

  const handleSaveUsername = async () => {
    if (!user || !profile) return;

    const supabase = getSupabaseBrowserClient();
    setUsernameError(null);
    setIsSavingUsername(true);
    try {
      const raw = usernameInput.trim();
      const normalized =
        raw.length === 0 ? null : normalizeUsernameCandidate(raw);

      if (raw.length > 0 && !normalized) {
        setUsernameError(
          'Usernames must be 3–24 characters, lowercase letters, numbers, or underscores, and not reserved.'
        );
        return;
      }

      if (normalized === (profile.username ?? null)) {
        return;
      }

      const { data, error: updateError } = await supabase
        .from('user_profiles')
        .update({ username: normalized })
        .eq('user_id', user.id)
        .select('*')
        .maybeSingle();

      if (updateError) {
        if (updateError.code === '23505') {
          setUsernameError('That username is already taken.');
        } else {
          setUsernameError('Failed to save username.');
        }
        return;
      }

      if (data) {
        setProfile(data);
        setUsernameInput(data.username ?? '');
      }
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      setPasswordError(
        'You need to be signed in with an email address to change your password.'
      );
      return;
    }

    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmNewPassword.trim();

    if (!trimmedCurrent || !trimmedNew || !trimmedConfirm) {
      setPasswordError('Please fill in all password fields.');
      setPasswordSuccess(null);
      return;
    }

    if (trimmedNew.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      setPasswordSuccess(null);
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setPasswordError('New passwords do not match.');
      setPasswordSuccess(null);
      return;
    }

    setPasswordError(null);
    setPasswordSuccess(null);
    setIsUpdatingPassword(true);

    try {
      const supabase = getSupabaseBrowserClient();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: trimmedCurrent,
      });

      if (signInError) {
        setPasswordError(
          'Current password is incorrect. If you usually sign in with Google, use Google Sign-In instead.'
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedNew,
      });

      if (updateError) {
        setPasswordError(
          'Something went wrong updating your password. Please try again.'
        );
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess('Your password has been updated.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleToggleCollectionsPublic = async () => {
    if (!user || !profile) return;

    const supabase = getSupabaseBrowserClient();
    const next = !collectionsPublic;
    setIsSavingCollectionsPublic(true);
    setError(null);
    setCollectionsPublic(next);

    try {
      const { data, error: updateError } = await supabase
        .from('user_profiles')
        .update({ collections_public: next })
        .eq('user_id', user.id)
        .select('*')
        .maybeSingle();

      if (updateError) {
        setError('Failed to update sharing settings.');
        setCollectionsPublic(prev => !prev);
        return;
      }

      if (data) {
        setProfile(data);
        setCollectionsPublic(data.collections_public ?? false);
      }
    } finally {
      setIsSavingCollectionsPublic(false);
    }
  };

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

      {/* Tabs for major account sections */}
      <nav className="border-b border-border-subtle">
        <div className="flex gap-4 overflow-x-auto px-1 pb-2 text-xs font-medium">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'account'}
            className={
              activeTab === 'account'
                ? 'border-b-2 border-theme-primary pb-1 text-theme-primary'
                : 'border-b-2 border-transparent pb-1 text-foreground-muted hover:text-foreground'
            }
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'display'}
            className={
              activeTab === 'display'
                ? 'border-b-2 border-theme-primary pb-1 text-theme-primary'
                : 'border-b-2 border-transparent pb-1 text-foreground-muted hover:text-foreground'
            }
            onClick={() => setActiveTab('display')}
          >
            Display &amp; behavior
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sets'}
            className={
              activeTab === 'sets'
                ? 'border-b-2 border-theme-primary pb-1 text-theme-primary'
                : 'border-b-2 border-transparent pb-1 text-foreground-muted hover:text-foreground'
            }
            onClick={() => setActiveTab('sets')}
          >
            Your sets
          </button>
        </div>
      </nav>

      {activeTab === 'account' && (
        <Card
          id="account-auth-section"
          aria-labelledby="account-auth-heading"
          className="border-none bg-transparent p-0 shadow-none"
        >
          <CardContent className="flex flex-col gap-6">
            <div>
              <CardTitle
                id="account-auth-heading"
                className="text-xl font-semibold text-foreground"
              >
                Sign-in &amp; identity
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-foreground-muted">
                Quarry supports Google Sign-In. Rebrickable and BrickLink are
                used only as data sources, not as login providers.
              </CardDescription>
            </div>

            <div className="mt-4 space-y-8">
              {isLoggedIn && (
                <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Email &amp; password
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    Manage your Quarry handle and email used for account-related
                    communication.
                  </p>
                  <label className="mt-2 text-[11px] font-medium text-foreground">
                    Username
                  </label>
                  <Input
                    type="text"
                    value={usernameInput}
                    onChange={e => {
                      setUsernameInput(e.target.value);
                      setUsernameError(null);
                    }}
                    className="w-full text-xs"
                  />
                  {usernameError && (
                    <p className="mt-1 text-[11px] text-red-600">
                      {usernameError}
                    </p>
                  )}
                  {!usernameError && (
                    <p className="mt-1 text-[11px] text-foreground-muted">
                      Pick a handle for public links. Lowercase letters,
                      numbers, and underscores; can be changed later.
                    </p>
                  )}
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSaveUsername()}
                      disabled={!isLoggedIn || isSavingUsername}
                      className="inline-flex items-center px-3 py-1.5 text-[11px]"
                    >
                      {isSavingUsername ? 'Saving…' : 'Save username'}
                    </Button>
                  </div>
                  <label className="mt-4 text-[11px] font-medium text-foreground">
                    Email
                  </label>
                  <Input
                    type="email"
                    disabled
                    value={googleEmail}
                    className="w-full text-xs text-foreground-muted"
                  />
                </div>
              )}

              {isLoggedIn && isEmailAuth && (
                <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Change password
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    Update your Quarry password. You&apos;ll need your current
                    password to make this change.
                  </p>
                  <label className="mt-2 text-[11px] font-medium text-foreground">
                    Current password
                  </label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="w-full text-xs"
                  />
                  <label className="mt-2 text-[11px] font-medium text-foreground">
                    New password
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full text-xs"
                  />
                  <label className="mt-2 text-[11px] font-medium text-foreground">
                    Confirm new password
                  </label>
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                    className="w-full text-xs"
                  />
                  {passwordError && (
                    <p className="mt-1 text-[11px] text-danger">
                      {passwordError}
                    </p>
                  )}
                  {passwordSuccess && (
                    <p className="mt-1 text-[11px] text-emerald-600">
                      {passwordSuccess}
                    </p>
                  )}
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleChangePassword()}
                      disabled={!isLoggedIn || isUpdatingPassword}
                      className="inline-flex items-center px-3 py-1.5 text-[11px]"
                    >
                      {isUpdatingPassword
                        ? 'Updating password…'
                        : 'Update password'}
                    </Button>
                  </div>
                </div>
              )}

              {(!isLoggedIn || isGoogleAuth) && (
                <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Google account
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    When you sign in with Google, your Google email will appear
                    here.
                  </p>
                  <label className="mt-1 text-[11px] font-medium text-foreground">
                    Google email
                  </label>
                  <Input
                    type="email"
                    disabled
                    value={googleEmail}
                    className="w-full text-xs text-foreground"
                  />
                  {!isLoggedIn && (
                    <Button
                      type="button"
                      onClick={() => {
                        window.location.href = '/login';
                      }}
                      size="sm"
                      className="mt-3 inline-flex items-center px-3 py-1.5 text-xs"
                    >
                      Connect Google
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-border-subtle pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Rebrickable account (optional)
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                In the future you’ll be able to link your Rebrickable account so
                Quarry can read your existing collection (via a Rebrickable user
                token).
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col">
                  <label className="mt-2 text-[11px] font-medium text-foreground">
                    Rebrickable user token
                  </label>
                  <Input
                    type="text"
                    disabled
                    placeholder="paste token here (coming soon)"
                    className="w-full text-xs text-foreground-muted"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled
                    size="sm"
                    className="w-full px-3 py-1.5 text-xs text-foreground-muted"
                  >
                    Connect Rebrickable (coming soon)
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'display' && (
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
                Control how Quarry behaves by default. These settings will be
                stored per account once authentication is wired up.
              </CardDescription>
            </div>

            <div className="mt-4 space-y-8">
              {/* Sharing */}
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Sharing
                </h3>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground-muted">
                    Control who can see your collections and how your public
                    profile link works.
                  </p>
                  <div className="mt-2 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-foreground">
                        Public collections
                      </label>
                      <p className="text-xs text-foreground-muted">
                        When enabled, your wishlist and custom collections can
                        be viewed by anyone with your public link. Owned
                        quantities are never shared.
                      </p>
                      <div className="mt-2 inline-flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={collectionsPublic}
                          onClick={() => void handleToggleCollectionsPublic()}
                          disabled={!isLoggedIn || isSavingCollectionsPublic}
                          className={`inline-flex h-5 w-9 items-center rounded-full border px-0.5 transition-colors ${
                            collectionsPublic
                              ? 'border-emerald-500 bg-emerald-500'
                              : 'border-border-subtle bg-background-muted'
                          } disabled:opacity-50`}
                        >
                          <span
                            className={`h-4 w-4 rounded-full bg-card shadow transition-transform ${
                              collectionsPublic
                                ? 'translate-x-3.5'
                                : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className="text-xs text-foreground-muted">
                          {collectionsPublic ? 'Public' : 'Private'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-foreground">
                        Public profile link
                      </label>
                      <p className="text-xs text-foreground-muted">
                        Share this link so others can see your wishlist and
                        collections. It will only work when public collections
                        are enabled.
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
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
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
                          'border-border-subtle text-foreground-muted hover:border-border-strong';
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
                      Choose Quarry&apos;s primary accent color. These map to
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
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
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
                      Choose whether to start on All, Missing, Owned, or a
                      specific category tab.
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
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Pricing &amp; currency
                </h3>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-foreground">
                      Currency
                    </label>
                    <p className="text-xs text-foreground-muted">
                      Currency for BrickLink price lookups. The API currently
                      uses USD; other currencies are placeholders for now.
                    </p>
                    <Select className="mt-1 w-full text-xs">
                      <option>USD (current)</option>
                      <option disabled>EUR (coming soon)</option>
                      <option disabled>GBP (coming soon)</option>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-foreground">
                      Pricing display
                    </label>
                    <p className="text-xs text-foreground-muted">
                      Control how BrickLink prices are derived and shown.
                      BrickLink exposes separate guides for current stock vs
                      last 6 months of sales; we&apos;ll map these options to
                      those guides when pricing is wired up.
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
      )}

      {activeTab === 'sets' && (
        <Card
          id="account-sets-section"
          aria-labelledby="account-sets-heading"
          className="border-none bg-transparent p-0 shadow-none"
        >
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle
                  id="account-sets-heading"
                  className="text-xl font-semibold text-foreground"
                >
                  Your sets
                </CardTitle>
                <CardDescription className="mt-1 text-sm text-foreground-muted">
                  Counts of sets you&apos;ve marked as owned or added to your
                  wishlist.
                </CardDescription>
              </div>
            </div>

            {!isLoggedIn && (
              <p className="mt-1 text-xs text-foreground-muted">
                Sign in to track your sets across devices.
              </p>
            )}
            <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
              <div className="rounded-md border border-border-subtle bg-card-muted px-3 py-2">
                <p className="text-[11px] tracking-wide text-foreground-muted uppercase">
                  Owned
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {ownedCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-border-subtle bg-card-muted px-3 py-2">
                <p className="text-[11px] tracking-wide text-foreground-muted uppercase">
                  Wishlist
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {wishlistCount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
