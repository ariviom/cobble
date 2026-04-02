'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { Suspense, useEffect, useState } from 'react';

import { PostHogPageview } from '@/app/components/analytics/PostHogPageview';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  useEffect(() => {
    if (!key) return;

    posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      persistence: 'memory',
      capture_pageview: false,
      capture_pageleave: true,
      loaded: ph => {
        if (process.env.NODE_ENV === 'development') ph.debug();
      },
    });

    setIsReady(true);
  }, [key]);

  if (!key || !isReady) return <>{children}</>;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  );
}
