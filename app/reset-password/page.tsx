'use client';

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
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Verify that user has an authenticated session (from auth callback)
  useEffect(() => {
    const verifySession = async () => {
      const supabase = getSupabaseBrowserClient();

      // Check for error in URL params (from failed callback)
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Invalid or expired reset link. Please request a new one.');
        setIsVerifying(false);
        return;
      }

      // Check if we have a session (should be set by auth callback)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setSessionReady(true);
        setIsVerifying(false);
        return;
      }

      // No session - user needs to request a new reset link
      setError(
        'Invalid reset link. Please request a new password reset from the login page.'
      );
      setIsVerifying(false);
    };

    void verifySession();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPassword || !trimmedConfirm) {
      setError('Please fill in both password fields.');
      return;
    }

    if (trimmedPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (trimmedPassword !== trimmedConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      const { error: updateError } = await supabase.auth.updateUser({
        password: trimmedPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to reset password. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while verifying token
  if (isVerifying) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Verifying reset link…
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Please wait while we verify your password reset link.
          </p>
        </header>
      </div>
    );
  }

  // Error state - invalid/expired token
  if (error && !sessionReady) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Reset link invalid
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            This password reset link has expired or is invalid.
          </p>
        </header>

        <Card elevated>
          <CardContent className="py-6">
            <ErrorBanner className="text-xs" message={error} />
            <div className="mt-4 text-center">
              <Link
                href="/forgot-password"
                className="font-medium text-link underline underline-offset-2 hover:text-link-hover"
              >
                Request a new reset link
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Link
            href="/login"
            className="text-xs font-medium text-link underline underline-offset-2 hover:text-link-hover"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Password updated
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Your password has been successfully reset.
          </p>
        </header>

        <Card elevated>
          <CardContent className="py-6">
            <Button
              type="button"
              className="w-full"
              onClick={() => router.push('/account')}
            >
              Go to your account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form state - ready to set new password
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set new password
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Enter your new password below.
        </p>
      </header>

      <Card elevated>
        <CardHeader>
          <div>
            <CardTitle>New password</CardTitle>
            <CardDescription>
              Choose a strong password with at least 8 characters.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label
              htmlFor="new-password"
              className="text-2xs font-medium text-foreground"
            >
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full text-xs"
              disabled={isLoading}
            />
            <label
              htmlFor="confirm-password"
              className="mt-2 text-2xs font-medium text-foreground"
            >
              Confirm password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className="w-full text-xs"
              disabled={isLoading}
            />
            {error && <ErrorBanner className="mt-2 text-xs" message={error} />}
            <Button
              type="submit"
              className="mt-3 w-full text-sm"
              disabled={isLoading}
            >
              {isLoading ? 'Updating…' : 'Reset password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Link
          href="/login"
          className="text-xs font-medium text-link underline underline-offset-2 hover:text-link-hover"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it
export default function ResetPasswordPage() {
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
      <ResetPasswordForm />
    </Suspense>
  );
}
