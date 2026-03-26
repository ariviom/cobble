import * as Sentry from '@sentry/nextjs';

/**
 * Validate that all required server-side env vars are present at startup.
 * Fails fast instead of throwing cryptic errors on first API call.
 */
function validateRequiredEnvVars() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'REBRICKABLE_API',
    'BRICKLINK_CONSUMER_KEY',
    'BRICKLINK_CONSUMER_SECRET',
    'BRICKLINK_TOKEN_VALUE',
    'BRICKLINK_TOKEN_SECRET',
  ];

  const missing = required.filter(name => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    validateRequiredEnvVars();
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
