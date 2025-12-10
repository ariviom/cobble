'use client';

import type { PropsWithChildren } from 'react';
import { DataProvider } from '@/app/components/providers/data-provider';

/**
 * LocalDataProviderBoundary
 *
 * Wraps a subtree in the local IndexedDB DataProvider.
 * Use this only on pages that actually need local owned state
 * or catalog caching (e.g., set detail, group sessions).
 */
export function LocalDataProviderBoundary({ children }: PropsWithChildren) {
  return <DataProvider>{children}</DataProvider>;
}
