'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              borderRadius: '0.5rem',
              border: '2px solid #e3000b',
              backgroundColor: '#fef2f2',
              padding: '1.5rem',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                marginBottom: '0.5rem',
                fontSize: '1.125rem',
                fontWeight: 600,
                color: '#e3000b',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{
                borderRadius: '0.375rem',
                border: '2px solid #e3000b',
                backgroundColor: '#ffffff',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                color: '#e3000b',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
