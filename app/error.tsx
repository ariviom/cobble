'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-2 text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl">
        Ouch!
      </h1>
      <p className="mb-1 text-2xl font-semibold text-foreground sm:text-3xl">
        You stepped on a brick!
      </p>
      <p className="mb-8 text-lg text-foreground-muted">
        Something went wrong. Try{' '}
        <Link
          href="/search"
          className="hover:text-theme-primary-hover text-theme-primary underline underline-offset-2"
        >
          searching for a set
        </Link>{' '}
        instead?
      </p>
      <button
        onClick={() => reset()}
        className="rounded-lg border-2 border-theme-primary bg-transparent px-6 py-2 text-sm font-medium text-theme-primary transition-colors hover:bg-theme-primary hover:text-white"
      >
        Try again
      </button>
    </div>
  );
}
