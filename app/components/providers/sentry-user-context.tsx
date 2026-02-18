'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { useAuth } from './auth-provider';

/**
 * Syncs the current authenticated user to Sentry so errors
 * include user identity. Renders nothing.
 */
export function SentryUserContext() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      Sentry.setUser({
        id: user.id,
        ...(user.email ? { email: user.email } : {}),
      });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  return null;
}
