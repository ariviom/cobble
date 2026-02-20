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
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Redirect authenticated users to home page
  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  // Check for error parameter from auth callback
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'auth_callback_error') {
      setError(
        'Authentication failed. The link may have expired. Please try again.'
      );
    }
  }, [searchParams]);

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

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (typeof window === 'undefined') {
        setError('Google sign-in is only available in the browser.');
        setIsLoading(false);
        return;
      }

      // Get redirect URL - automatically uses current origin (any port in dev)
      // IMPORTANT: The origin must be whitelisted in Supabase Dashboard > Authentication > URL Configuration
      const redirectUrl = getAuthRedirectUrl();

      // Log for debugging (remove in production if needed)
      if (process.env.NODE_ENV === 'development') {
        logger.debug('auth.login.oauth_redirect_url', { redirectUrl });
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            // Ensure we're explicitly setting the redirect
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (authError) {
        // Provide more helpful error messages
        const errorMessage =
          authError.message.includes('redirect_uri') ||
          authError.message.includes('redirect')
            ? `Redirect URL not configured. Current URL: ${redirectUrl}. Please ensure this exact URL is added to Supabase Dashboard > Authentication > URL Configuration > Redirect URLs.`
            : authError.message;
        setError(errorMessage);
        setIsLoading(false);
      } else if (data?.url) {
        // Supabase returns a URL to redirect to - this should already include our redirectTo
        // The redirect happens automatically via window.location
      }
      // On success, Supabase will redirect; no further state update needed here.
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to start Google sign-in. Please try again.';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setEmailError('Please enter both email and password.');
      return;
    }

    setIsEmailLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (signInError) {
        // Provide user-friendly error messages
        if (signInError.message.includes('Invalid login credentials')) {
          setEmailError('Invalid email or password.');
        } else if (signInError.message.includes('Email not confirmed')) {
          setEmailError(
            'Please check your email and confirm your account before signing in.'
          );
        } else {
          setEmailError(signInError.message);
        }
        return;
      }

      // Success - redirect to home page
      router.push('/');
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to sign in. Please try again.';
      setEmailError(errorMessage);
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-base text-foreground-muted">
          Sign in to your Brick Party account
        </p>
      </header>

      <Card elevated variant="theme">
        <CardHeader>
          <div>
            <CardTitle>Sign in with Google</CardTitle>
            <CardDescription>
              Recommended. Brick Party will use your Google account as your
              primary identity.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="google"
            className="flex w-full items-center justify-center gap-2"
            onClick={handleGoogleLogin}
            disabled={isLoading}
          >
            {!isLoading && <GoogleIcon className="h-4 w-4" />}
            {isLoading ? 'Redirecting…' : 'Sign in with Google'}
          </Button>
          {error && <ErrorBanner className="mt-3 text-xs" message={error} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sign in with email &amp; password</CardTitle>
            <CardDescription>
              Use your email and password to sign in.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailLogin} className="flex flex-col gap-2">
            <label
              htmlFor="login-email"
              className="text-2xs font-medium text-foreground"
            >
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-xs"
              disabled={isEmailLoading}
            />
            <label
              htmlFor="login-password"
              className="mt-2 text-2xs font-medium text-foreground"
            >
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-xs"
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
              {isEmailLoading ? 'Signing in…' : 'Sign in with email'}
            </Button>
            <div className="mt-2 flex justify-between text-xs">
              <Link
                href="/signup"
                className="font-medium text-link underline underline-offset-2 hover:text-link-hover"
              >
                Create account
              </Link>
              <Link
                href="/forgot-password"
                className="font-medium text-foreground-muted underline underline-offset-2"
              >
                Forgot password?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-4">
        <p className="px-8 text-center text-xs text-foreground-muted">
          By signing in, you agree to our{' '}
          <Link
            href="/terms"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>

        <Link
          href="/"
          className="text-xs font-medium text-link underline underline-offset-2 hover:text-link-hover"
        >
          Home
        </Link>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
          <header className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Loading…</h1>
          </header>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
