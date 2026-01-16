'use client';

import {
  USER_THEME_COLOR_KEY,
  USER_THEME_KEY,
} from '@/app/components/theme/constants';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardHeader,
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
    <div className="space-y-6">
      {/* Sign-in & Identity Section */}
      <Card>
        <CardHeader>
          <CardTitle>Sign-in &amp; identity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body text-foreground-muted">
            Brick Party supports Google Sign-In. Rebrickable and BrickLink are
            used only as data sources, not as login providers.
          </p>

          {isLoggedIn && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-label font-semibold text-foreground">
                  Username
                </label>
                <p className="text-body-sm mt-0.5 text-foreground-muted">
                  Pick a handle for public links. Lowercase letters, numbers,
                  and underscores.
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    type="text"
                    size="sm"
                    value={usernameInput}
                    onChange={e => {
                      setUsernameInput(e.target.value);
                      setUsernameError(null);
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleSaveUsername()}
                    disabled={!isLoggedIn || isSavingUsername}
                  >
                    {isSavingUsername ? 'Saving…' : 'Save'}
                  </Button>
                </div>
                {usernameError && (
                  <p className="text-body-sm mt-1.5 font-medium text-danger">
                    {usernameError}
                  </p>
                )}
              </div>

              <div>
                <label className="text-label font-semibold text-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  size="sm"
                  disabled
                  value={googleEmail}
                  className="mt-2"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password Section (email auth only) */}
      {isLoggedIn && isEmailAuth && (
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body text-foreground-muted">
              Update your Brick Party password. You&apos;ll need your current
              password to make this change.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-label font-semibold text-foreground">
                  Current password
                </label>
                <Input
                  type="password"
                  size="sm"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-label font-semibold text-foreground">
                  New password
                </label>
                <Input
                  type="password"
                  size="sm"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <label className="text-label font-semibold text-foreground">
                  Confirm new password
                </label>
                <Input
                  type="password"
                  size="sm"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  className="mt-2"
                />
              </div>
              {passwordError && (
                <p className="text-body-sm font-medium text-danger">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p className="text-body-sm font-medium text-success">
                  {passwordSuccess}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => void handleChangePassword()}
                disabled={!isLoggedIn || isUpdatingPassword}
              >
                {isUpdatingPassword ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Account Section (not logged in or Google auth) */}
      {(!isLoggedIn || isGoogleAuth) && (
        <Card>
          <CardHeader>
            <CardTitle>Google account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body text-foreground-muted">
              When you sign in with Google, your Google email will appear here.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-label font-semibold text-foreground">
                  Google email
                </label>
                <Input
                  type="email"
                  size="sm"
                  disabled
                  value={googleEmail}
                  className="mt-2"
                />
              </div>
              {!isLoggedIn && (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    window.location.href = '/login';
                  }}
                >
                  Connect Google
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sign Out Section */}
      {isLoggedIn && (
        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-body text-foreground-muted">
              Log out of Brick Party on this device. You can sign back in with
              Google or email later.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Signing out…' : 'Log out'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legal links */}
      <div className="text-body-sm flex justify-center gap-3 pt-4 text-foreground-muted">
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
    </div>
  );
}
