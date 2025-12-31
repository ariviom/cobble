'use client';

import {
  USER_THEME_COLOR_KEY,
  USER_THEME_KEY,
} from '@/app/components/theme/constants';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { normalizeUsernameCandidate } from '@/app/lib/users';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { UserId, UserProfileRow } from '../hooks/useAccountData';

type AccountTabProps = {
  user: User | null;
  profile: UserProfileRow | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfileRow | null) => void;
  setError: (error: string | null) => void;
};

export function AccountTab({
  user,
  profile,
  setUser,
  setProfile,
  setError,
}: AccountTabProps) {
  const router = useRouter();
  const isLoggedIn = !!user;
  const authProvider =
    isLoggedIn && user?.app_metadata
      ? (user.app_metadata.provider as string | null)
      : null;
  const isGoogleAuth = authProvider === 'google';
  const isEmailAuth = authProvider === 'email';
  const googleEmail = user?.email ?? 'not connected';

  // Username state
  const [usernameInput, setUsernameInput] = useState(profile?.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Logout state
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
    <>
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
              Brick Party supports Google Sign-In. Rebrickable and BrickLink are
              used only as data sources, not as login providers.
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
                    Pick a handle for public links. Lowercase letters, numbers,
                    and underscores; can be changed later.
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

          {/* 
        <div className="mt-6 border-t border-subtle pt-4">
          <h3 className="text-sm font-semibold text-foreground">
            Rebrickable account (optional)
          </h3>
          <p className="mt-1 text-xs text-foreground-muted">
            In the future you&apos;ll be able to link your Rebrickable account
            so Brick Party can read your existing collection (via a Rebrickable
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
        */}

          {isLoggedIn && (
            <div className="mt-6 border-t border-subtle pt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Sign out
              </h3>
              <p className="mt-1 text-xs text-foreground-muted">
                Log out of Brick Party on this device. You can sign back in with
                Google or email later.
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

      {/* Legal links - visible for all users */}
      <div className="mt-6 flex justify-center gap-3 text-xs text-foreground-muted">
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </Link>
        <span>•</span>
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of Service
        </Link>
      </div>
    </>
  );
}
