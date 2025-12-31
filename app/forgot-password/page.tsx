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
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      // Use the auth callback route which will redirect to reset-password
      const callbackUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=/reset-password`
          : 'http://localhost:3000/auth/callback?next=/reset-password';

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo: callbackUrl,
        }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      // Always show success even if email doesn't exist (security best practice)
      setSuccess(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to send reset email. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
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
            If an account exists for <strong>{email}</strong>, we sent a
            password reset link.
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
          Reset password
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Enter your email and we&apos;ll send you a link to reset your
          password.
        </p>
      </header>

      <Card elevated>
        <CardHeader>
          <div>
            <CardTitle>Forgot your password?</CardTitle>
            <CardDescription>
              We&apos;ll email you a secure link to set a new password.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label
              htmlFor="reset-email"
              className="text-[11px] font-medium text-foreground"
            >
              Email
            </label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-xs"
              disabled={isLoading}
            />
            {error && <ErrorBanner className="mt-2 text-xs" message={error} />}
            <Button
              type="submit"
              className="mt-3 w-full text-sm"
              disabled={isLoading}
            >
              {isLoading ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <span className="text-xs text-foreground-muted">
          Remember your password?{' '}
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
