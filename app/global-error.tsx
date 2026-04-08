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
      <head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #1a1a2e; color: #e0e0e0; }
            .ge-card { background: #2a1a1a; border-color: #e3000b; }
            .ge-text { color: #e0e0e0; }
            .ge-btn { background: #2a1a1a; }
          }
        `}</style>
      </head>
      <body style={{ margin: 0 }}>
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
            className="ge-card"
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
                fontSize: '1.5rem',
                fontWeight: 800,
                color: '#e3000b',
              }}
            >
              Ouch! You stepped on a brick!
            </h2>
            <p
              className="ge-text"
              style={{
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              Something went seriously wrong. Please try again.
            </p>
            <button
              onClick={() => reset()}
              className="ge-btn"
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
