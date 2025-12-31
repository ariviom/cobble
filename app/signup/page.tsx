'use client';

import { GoogleIcon } from '@/app/components/icons/GoogleIcon';
import { useAuth } from '@/app/components/providers/auth-provider';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Input } from '@/app/components/ui/Input';
import {
  getAuthRedirectUrl,
  getSupabaseBrowserClient,
} from '@/app/lib/supabaseClient';
import { logger } from '@/lib/metrics';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);

  // Redirect authenticated users to account page
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/account');
    }
  }, [authLoading, user, router]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Loading…</h1>
        </header>
      </div>
    );
  }

  // Don't render form if already logged in (redirect is in progress)
  if (user) {
    return null;
  }

  const handleGoogleSignup = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (typeof window === 'undefined') {
        setError('Google sign-up is only available in the browser.');
        setIsLoading(false);
        return;
      }

      const redirectUrl = getAuthRedirectUrl();

      if (process.env.NODE_ENV === 'development') {
        logger.debug('auth.signup.oauth_redirect_url', { redirectUrl });
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (authError) {
        const errorMessage =
          authError.message.includes('redirect_uri') ||
          authError.message.includes('redirect')
            ? `Redirect URL not configured. Current URL: ${redirectUrl}. Please ensure this exact URL is added to Supabase Dashboard > Authentication > URL Configuration > Redirect URLs.`
            : authError.message;
        setError(errorMessage);
        setIsLoading(false);
      } else if (data?.url) {
        // Redirect happens automatically
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to start Google sign-up. Please try again.';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedEmail || !trimmedPassword || !trimmedConfirm) {
      setEmailError('Please fill in all fields.');
      return;
    }

    if (trimmedPassword.length < 8) {
      setEmailError('Password must be at least 8 characters.');
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setEmailError('Passwords do not match.');
      return;
    }

    setIsEmailLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      // Use the auth callback route to handle the email confirmation
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : 'http://localhost:3000/auth/callback';

      const { error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setEmailError(
            'An account with this email already exists. Try signing in instead.'
          );
        } else {
          setEmailError(signUpError.message);
        }
        return;
      }

      // Success - show confirmation message
      setSuccess(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to create account. Please try again.';
      setEmailError(errorMessage);
    } finally {
      setIsEmailLoading(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            We sent a confirmation link to <strong>{email}</strong>. Click the
            link in the email to activate your account.
          </p>
        </header>

        <Card elevated>
          <CardContent className="py-6">
            <p className="text-center text-sm text-foreground-muted">
              Didn&apos;t receive the email? Check your spam folder, or{' '}
              <button
                type="button"
                onClick={() => setSuccess(false)}
                className="font-medium text-theme-primary underline underline-offset-2"
              >
                try again
              </button>
              .
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Link
            href="/login"
            className="text-xs font-medium text-theme-primary underline underline-offset-2"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create account
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Sign up to save your collection and sync across devices.
        </p>
      </header>

      <Card elevated>
        <CardHeader>
          <div>
            <CardTitle>Sign up with Google</CardTitle>
            <CardDescription>
              Quickest way to get started. No password needed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="google"
            className="flex w-full items-center justify-center gap-2"
            onClick={handleGoogleSignup}
            disabled={isLoading}
          >
            {!isLoading && <GoogleIcon className="h-4 w-4" />}
            {isLoading ? 'Redirecting…' : 'Sign up with Google'}
          </Button>
          {error && <ErrorBanner className="mt-3 text-xs" message={error} />}
        </CardContent>
      </Card>

      <Card elevated>
        <CardHeader>
          <div>
            <CardTitle>Sign up with email</CardTitle>
            <CardDescription>
              Create an account with your email and password.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSignup} className="flex flex-col gap-2">
            <label
              htmlFor="signup-email"
              className="text-[11px] font-medium text-foreground"
            >
              Email
            </label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-xs"
              disabled={isEmailLoading}
            />
            <label
              htmlFor="signup-password"
              className="mt-2 text-[11px] font-medium text-foreground"
            >
              Password
            </label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full text-lg tracking-widest"
              disabled={isEmailLoading}
            />
            <label
              htmlFor="signup-confirm"
              className="mt-2 text-[11px] font-medium text-foreground"
            >
              Confirm password
            </label>
            <Input
              id="signup-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className="w-full text-lg tracking-widest"
              disabled={isEmailLoading}
            />
            {emailError && (
              <ErrorBanner className="mt-2 text-xs" message={emailError} />
            )}
            <Button
              type="submit"
              variant="secondary"
              className="mt-3 w-full text-sm"
              disabled={isEmailLoading}
            >
              {isEmailLoading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <span className="text-xs text-foreground-muted">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-theme-primary underline underline-offset-2"
          >
            Sign in
          </Link>
        </span>
      </div>

      <div className="flex justify-center">
        <Link
          href="/"
          className="text-xs font-medium text-theme-primary underline underline-offset-2"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
