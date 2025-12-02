'use client';

import {
  getAuthRedirectUrl,
  getSupabaseBrowserClient,
} from '@/app/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { GoogleIcon } from '@/app/components/icons/GoogleIcon';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import Link from 'next/link';
import { useState } from 'react';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (typeof window === 'undefined') {
        setError('Google sign-in is only available in the browser.');
        setIsLoading(false);
        return;
      }

      // Get redirect URL - automatically uses current origin
      // In dev: http://localhost:3000/account
      // In prod: https://brick-party.com/account
      // IMPORTANT: This exact URL must be configured in Supabase Dashboard > Authentication > URL Configuration
      // as an allowed redirect URL for OAuth to work.
      const redirectUrl = getAuthRedirectUrl();

      // Log for debugging (remove in production if needed)
      if (process.env.NODE_ENV === 'development') {
        console.log('OAuth redirect URL:', redirectUrl);
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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Sign in with your Google account. Email/password and other providers
          will be added later.
        </p>
      </header>

      <Card elevated>
        <CardHeader>
          <div>
            <CardTitle>Sign in with Google</CardTitle>
            <CardDescription>
              Recommended. Quarry will use your Google account as your primary
              identity.
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
          {error && (
            <ErrorBanner className="mt-3 text-xs" message={error} />
          )}
        </CardContent>
      </Card>

      <Card elevated>
        <CardHeader>
          <div>
            <CardTitle>Sign in with email &amp; password</CardTitle>
            <CardDescription>
              Optional alternative. These fields are placeholders until auth is
              wired to Supabase.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-medium text-foreground">
              Email
            </label>
            <Input
              type="email"
              disabled
              placeholder="you@example.com"
              className="w-full text-xs"
            />
            <label className="mt-2 text-[11px] font-medium text-foreground">
              Password
            </label>
            <Input
              type="password"
              disabled
              placeholder="••••••••"
              className="w-full text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full text-sm text-foreground-muted"
              disabled
            >
              Sign in with email (coming soon)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Link
          href="/"
          className="text-xs font-medium text-theme-primary underline underline-offset-2"
        >
          Back to sets
        </Link>
      </div>
    </div>
  );
}
