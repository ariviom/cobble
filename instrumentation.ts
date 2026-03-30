import * as Sentry from '@sentry/nextjs';

/**
 * Validate that all required server-side env vars are present at startup.
 * Fails fast instead of throwing cryptic errors on first API call.
 */
function validateRequiredEnvVars() {
  const critical = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const recommended = [
    'REBRICKABLE_API',
    'BRICKLINK_CONSUMER_KEY',
    'BRICKLINK_CONSUMER_SECRET',
    'BRICKLINK_TOKEN_VALUE',
    'BRICKLINK_TOKEN_SECRET',
  ];

  const missingCritical = critical.filter(name => !process.env[name]);
  if (missingCritical.length > 0) {
    throw new Error(
      `Missing critical environment variables: ${missingCritical.join(', ')}`
    );
  }

  const missingRecommended = recommended.filter(name => !process.env[name]);
  if (missingRecommended.length > 0) {
    console.warn(
      `Missing recommended environment variables: ${missingRecommended.join(', ')}. Related features will be unavailable.`
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
