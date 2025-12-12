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
import {
  BRICKLINK_COUNTRY_OPTIONS,
  BRICKLINK_CURRENCY_OPTIONS,
  DEFAULT_PRICING_PREFERENCES,
} from '@/app/lib/pricing';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  saveUserMinifigSyncPreferences,
  type MinifigSyncPreferences,
} from '@/app/lib/userMinifigSyncPreferences';
import {
  loadUserPricingPreferences,
  saveUserPricingPreferences,
} from '@/app/lib/userPricingPreferences';
import { buildUserHandle, normalizeUsernameCandidate } from '@/app/lib/users';
import { useUserSetsStore } from '@/app/store/user-sets';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  USER_THEME_COLOR_KEY,
  USER_THEME_KEY,
} from '../components/theme/constants';

type UserProfileRow = Tables<'user_profiles'>;
type UserId = UserProfileRow['user_id'];

type AccountPageClientProps = {
  initialUser: User | null;
  initialProfile: UserProfileRow | null;
  initialPricingCurrency: string;
  initialPricingCountry: string | null;
  initialSyncOwnedMinifigsFromSets: boolean;
};

export default function AccountPageClient({
  initialUser,
  initialProfile,
  initialPricingCurrency,
  initialPricingCountry,
  initialSyncOwnedMinifigsFromSets,
}: AccountPageClientProps) {
  useHydrateUserSets();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<UserProfileRow | null>(initialProfile);
  const [isLoading, setIsLoading] = useState(() => !initialUser);
  const [error, setError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState(
    initialProfile?.username ?? ''
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [listsPublic, setListsPublic] = useState(
    initialProfile?.lists_public ?? false
  );
  const [isSavingListsPublic, setIsSavingListsPublic] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [pricingCurrency, setPricingCurrency] = useState<string>(
    initialPricingCurrency ?? DEFAULT_PRICING_PREFERENCES.currencyCode
  );
  const [pricingCountry, setPricingCountry] = useState<string | null>(
    initialPricingCountry ?? DEFAULT_PRICING_PREFERENCES.countryCode
  );
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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
  const [syncOwnedMinifigsFromSets, setSyncOwnedMinifigsFromSets] =
    useState<boolean>(initialSyncOwnedMinifigsFromSets ?? true);
  const [isSavingMinifigSync, setIsSavingMinifigSync] = useState(false);
  const [isRunningMinifigSyncNow, setIsRunningMinifigSyncNow] = useState(false);
  const [minifigSyncError, setMinifigSyncError] = useState<string | null>(null);
  const [minifigSyncMessage, setMinifigSyncMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    // If SSR already provided a user, skip the initial client fetch.
    if (user) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          setError(userError.message);
          setUser(null);
          setProfile(null);
          return;
        }

        if (!fetchedUser) {
          setUser(null);
          setProfile(null);
          return;
        }

        setUser(fetchedUser);

        const { data: existingProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', fetchedUser.id as UserId)
          .maybeSingle();

        if (profileError) {
          setError(profileError.message);
        }

        if (!existingProfile) {
          const displayName =
            (fetchedUser.user_metadata &&
              (fetchedUser.user_metadata.full_name as string | undefined)) ||
            fetchedUser.email ||
            null;

          const { data: createdProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: fetchedUser.id as UserId,
              display_name: displayName,
            })
            .select('*')
            .maybeSingle();

          if (insertError) {
            setError(insertError.message);
          } else if (createdProfile) {
            setProfile(createdProfile);
            setUsernameInput(createdProfile.username ?? '');
            setListsPublic(createdProfile.lists_public ?? false);
          }
        } else {
          setProfile(existingProfile);
          setUsernameInput(existingProfile.username ?? '');
          setListsPublic(existingProfile.lists_public ?? false);
        }

        try {
          const pricingPrefs = await loadUserPricingPreferences(
            supabase,
            fetchedUser.id
          );
          setPricingCurrency(pricingPrefs.currencyCode);
          setPricingCountry(pricingPrefs.countryCode);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            try {
              console.warn('AccountPage: failed to load pricing preferences', {
                error: err instanceof Error ? err.message : String(err),
              });
            } catch {}
          }
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
  }, [user]);

  const googleEmail = user?.email ?? 'not connected';

  const publicHandle =
    profile &&
    buildUserHandle({ user_id: profile.user_id, username: profile.username });

  const handleSaveMinifigSyncPreference = async (next: boolean) => {
    if (!user) {
      setMinifigSyncError('Sign in to change minifigure sync settings.');
      return;
    }

    setIsSavingMinifigSync(true);
    setMinifigSyncError(null);
    setMinifigSyncMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const patch: Partial<MinifigSyncPreferences> = {
        syncOwnedFromSets: next,
      };
      await saveUserMinifigSyncPreferences(supabase, user.id, patch);
      setSyncOwnedMinifigsFromSets(next);
      setMinifigSyncMessage('Minifigure sync preference saved.');
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.error('AccountPage: failed to save minifig sync prefs', {
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {}
      }
      setMinifigSyncError('Failed to save minifigure sync preference.');
    } finally {
      setIsSavingMinifigSync(false);
    }
  };

  const handleRunMinifigSyncNow = async () => {
    if (!user) {
      setMinifigSyncError('Sign in to sync minifigures from sets.');
      return;
    }

    const confirmed = window.confirm(
      'This will recompute your owned minifigures from your currently-owned sets. Minifigure quantities will be adjusted to match quantities in those sets. Continue?'
    );
    if (!confirmed) return;

    setIsRunningMinifigSyncNow(true);
    setMinifigSyncError(null);
    setMinifigSyncMessage(null);

    try {
      const res = await fetch('/api/user/minifigs/sync-from-sets?force=1', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        updated?: number;
      } | null;

      if (!res.ok || !data?.ok) {
        setMinifigSyncError('Sync failed. Please try again in a moment.');
        return;
      }

      const updatedCount =
        typeof data.updated === 'number' && Number.isFinite(data.updated)
          ? data.updated
          : 0;
      setMinifigSyncMessage(
        updatedCount > 0
          ? `Synced owned minifigures from sets (updated ${updatedCount.toLocaleString()} records).`
          : 'Synced owned minifigures from sets (no changes needed).'
      );
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        try {
          console.error('AccountPage: manual minifig sync failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {}
      }
      setMinifigSyncError('Sync failed. Please try again.');
    } finally {
      setIsRunningMinifigSyncNow(false);
    }
  };

  const publicPath = publicHandle ? `/user/${publicHandle}` : null;

  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const publicUrl = publicPath ? `${origin || ''}${publicPath}` : null;

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

  const clearThemePersistence = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(USER_THEME_KEY);
        window.localStorage.removeItem(USER_THEME_COLOR_KEY);
      } catch {
        // ignore storage errors
      }
      try {
        document.cookie =
          'brickparty_theme_pref=; Path=/; Max-Age=0; SameSite=Lax';
      } catch {
        // ignore cookie errors
      }
    }
  };

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
        .eq('user_id', user.id as UserId)
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
        .eq('user_id', user.id)
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

  const handleLogout = async () => {
    if (!user || isLoggingOut) return;

    setIsLoggingOut(true);
    setError(null);

    try {
      const apiResponse = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!apiResponse.ok) {
        throw new Error('Server sign out failed');
      }

      const supabase = getSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut({
        scope: 'local',
      });

      if (signOutError) {
        throw signOutError;
      }
    } catch {
      setError('Failed to log out. Please try again.');
      return;
    } finally {
      setIsLoggingOut(false);
    }

    clearThemePersistence();
    setUser(null);
    setProfile(null);
    router.push('/login');
  };

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

      {/* Tabs for major account sections */}
      <nav className="border-b border-subtle">
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
                Brick Party supports Google Sign-In. Rebrickable and BrickLink
                are used only as data sources, not as login providers.
              </CardDescription>
            </div>

            <div className="mt-4 space-y-8">
              {isLoggedIn && (
                <div className="flex flex-col gap-2 border-t border-subtle pt-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Email &amp; password
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    Manage your Brick Party handle and email used for
                    account-related communication.
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
                <div className="flex flex-col gap-2 border-t border-subtle pt-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Change password
                  </h3>
                  <p className="text-xs text-foreground-muted">
                    Update your Brick Party password. You&apos;ll need your
                    current password to make this change.
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
                <div className="flex flex-col gap-2 border-t border-subtle pt-4">
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

            <div className="mt-6 border-t border-subtle pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Rebrickable account (optional)
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                In the future you’ll be able to link your Rebrickable account so
                Brick Party can read your existing collection (via a Rebrickable
                user token).
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

            {isLoggedIn && (
              <div className="mt-6 border-t border-subtle pt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Sign out
                </h3>
                <p className="mt-1 text-xs text-foreground-muted">
                  Log out of Brick Party on this device. You can sign back in
                  with Google or email later.
                </p>
                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleLogout()}
                    disabled={isLoggingOut}
                    className="inline-flex items-center px-3 py-1.5 text-[11px]"
                  >
                    {isLoggingOut ? 'Signing out…' : 'Log out'}
                  </Button>
                </div>
              </div>
            )}
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
                Control how Brick Party behaves by default. These settings will
                be stored per account once authentication is wired up.
              </CardDescription>
            </div>

            <div className="mt-4 space-y-8">
              {/* Sharing */}
              <div className="flex flex-col gap-3 border-t border-subtle pt-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Sharing
                </h3>
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground-muted">
                    Control who can see your lists and how your public profile
                    link works.
                  </p>
                  <div className="mt-2 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium text-foreground">
                        Public lists
                      </label>
                      <p className="text-xs text-foreground-muted">
                        When enabled, your wishlist and custom lists can be
                        viewed by anyone with your public link. Owned quantities
                        are never shared.
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
                        Share this link so others can see your wishlist and
                        lists. It will only work when public lists are enabled.
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
                      Choose Brick Party&apos;s primary accent color. These map
                      to the brand colors defined in the global theme.
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
                      Currency for BrickLink price lookups. Defaults to USD for
                      new accounts.
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
                      Limit BrickLink prices to sellers in a single country, or
                      use worldwide data.
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
            <div className="mt-4 space-y-3 border-t border-subtle pt-4">
              <div className="rounded-md border border-subtle bg-card-muted px-3 py-2">
                <p className="text-[11px] tracking-wide text-foreground-muted uppercase">
                  Owned
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {ownedCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-md border border-subtle bg-card-muted px-3 py-2">
                <p className="text-[11px] tracking-wide text-foreground-muted uppercase">
                  Wishlist
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {wishlistCount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4 border-t border-subtle pt-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Minifigure sync from owned sets
                </h3>
                <p className="mt-1 text-xs text-foreground-muted">
                  When enabled, Brick Party keeps your{' '}
                  <span className="font-medium">owned</span> minifigures in sync
                  with the sets you&apos;ve marked as owned. Minifigure
                  wishlists are never created or updated automatically.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3 w-3 accent-theme-primary"
                      checked={syncOwnedMinifigsFromSets}
                      onChange={event =>
                        void handleSaveMinifigSyncPreference(
                          event.target.checked
                        )
                      }
                      disabled={!isLoggedIn || isSavingMinifigSync}
                    />
                    <span>Automatically sync owned set minifigures</span>
                  </label>
                  {isSavingMinifigSync && (
                    <span className="text-[11px] text-foreground-muted">
                      Saving…
                    </span>
                  )}
                </div>
                {minifigSyncError && (
                  <p className="mt-1 text-[11px] text-brand-red">
                    {minifigSyncError}
                  </p>
                )}
                {minifigSyncMessage && !minifigSyncError && (
                  <p className="mt-1 text-[11px] text-emerald-600">
                    {minifigSyncMessage}
                  </p>
                )}
              </div>

              <div className="rounded-md border border-subtle bg-card px-3 py-2 text-xs">
                <p className="font-semibold text-foreground">
                  One-time sync from owned sets
                </p>
                <p className="mt-1 text-[11px] text-foreground-muted">
                  This will recompute your{' '}
                  <span className="font-medium">owned</span> minifigures from
                  the sets you&apos;ve marked as owned. Minifigure quantities
                  will be adjusted to match quantities found in those sets.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRunMinifigSyncNow()}
                    disabled={!isLoggedIn || isRunningMinifigSyncNow}
                    className="inline-flex items-center px-3 py-1.5 text-[11px]"
                  >
                    {isRunningMinifigSyncNow
                      ? 'Syncing…'
                      : 'Sync owned set minifigures now'}
                  </Button>
                  {isRunningMinifigSyncNow && (
                    <span className="text-[11px] text-foreground-muted">
                      This may take a few seconds.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
