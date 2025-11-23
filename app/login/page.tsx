'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';

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
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/account`,
        },
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
      }
      // On success, Supabase will redirect; no further state update needed here.
    } catch {
      setError('Failed to start Google sign-in. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10 lg:px-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Sign in with your Google account. Email/password and other providers will be added
          later.
        </p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">Sign in with Google</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Recommended. Quarry will use your Google account as your primary identity.
        </p>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:cursor-not-allowed disabled:bg-neutral-900/70"
        >
          {isLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-background p-4 shadow-sm">
        <h2 className="text-sm font-medium text-foreground">
          Sign in with email &amp; password
        </h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Optional alternative. These fields are placeholders until auth is wired to
          Supabase.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-[11px] font-medium text-foreground">
            Email
          </label>
          <input
            type="email"
            disabled
            placeholder="you@example.com"
            className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
          />
          <label className="mt-2 text-[11px] font-medium text-foreground">
            Password
          </label>
          <input
            type="password"
            disabled
            placeholder="••••••••"
            className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 text-xs text-neutral-500"
          />
          <button
            type="button"
            disabled
            className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 disabled:cursor-not-allowed"
          >
            Sign in with email (coming soon)
          </button>
        </div>
      </section>

      <div className="flex justify-center">
        <Link
          href="/"
          className="text-xs font-medium text-foreground underline underline-offset-2"
        >
          Back to sets
        </Link>
      </div>
    </div>
  );
}



