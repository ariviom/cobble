import { useEffect, useRef } from 'react';

/**
 * Detects the transition from totalMissing > 0 → totalMissing === 0.
 *
 * Guards:
 * - Requires isOwnedHydrated (don't fire during initial load)
 * - Skips first render after hydration (prevents false-fire if set is already complete)
 * - Requires totalRequired > 0 (real inventory loaded)
 */
export function useSetComplete(
  totalMissing: number,
  totalRequired: number,
  isOwnedHydrated: boolean,
  onComplete: () => void
) {
  const prevMissing = useRef<number | null>(null);
  const hasSeenFirstValue = useRef(false);

  useEffect(() => {
    if (!isOwnedHydrated || totalRequired === 0) return;

    // First render after hydration — record baseline, don't fire
    if (!hasSeenFirstValue.current) {
      hasSeenFirstValue.current = true;
      prevMissing.current = totalMissing;
      return;
    }

    // Transition: was missing some → now missing none
    if (
      prevMissing.current !== null &&
      prevMissing.current > 0 &&
      totalMissing === 0
    ) {
      onComplete();
    }

    prevMissing.current = totalMissing;
  }, [totalMissing, totalRequired, isOwnedHydrated, onComplete]);
}
