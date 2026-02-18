'use client';

/**
 * Hook to check if pricing features are enabled.
 * DB-backed pricing system is now live — always enabled.
 */
export function usePricingEnabled(): boolean {
  return true;
}
