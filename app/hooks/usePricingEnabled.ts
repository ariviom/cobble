'use client';

/**
 * Hook to check if pricing features are enabled.
 * During beta, pricing is disabled to avoid BrickLink API quota issues.
 * Returns false when NEXT_PUBLIC_PRICING_ENABLED is explicitly set to 'false'.
 */
export function usePricingEnabled(): boolean {
  // Check environment variable - explicitly disable during beta
  if (process.env.NEXT_PUBLIC_PRICING_ENABLED === 'false') {
    return false;
  }
  return true;
}
