'use client';

import { useCallback, useEffect, useState } from 'react';

type MobileToast = {
  message: string;
  variant: 'success' | 'error';
};

type OwnershipToastMessages = {
  owned: string;
  removed: string;
};

type UseOwnershipToastResult = {
  mobileToast: MobileToast | null;
  clearMobileToast: () => void;
  handleToggleOwned: () => void;
};

/**
 * Encapsulates mobile toast state and auto-dismiss for ownership toggle buttons.
 * Calls `toggleOwned` and shows a brief toast on mobile viewports where the
 * label text is hidden.
 */
export function useOwnershipToast(
  isOwned: boolean,
  toggleOwned: () => void,
  messages: OwnershipToastMessages
): UseOwnershipToastResult {
  const [mobileToast, setMobileToast] = useState<MobileToast | null>(null);

  // Auto-hide mobile toast after 2 seconds
  useEffect(() => {
    if (!mobileToast) return;
    const timer = setTimeout(() => setMobileToast(null), 2000);
    return () => clearTimeout(timer);
  }, [mobileToast]);

  const handleToggleOwned = useCallback(() => {
    const willBeOwned = !isOwned;
    toggleOwned();

    // Show toast on mobile (when label is hidden)
    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    if (isMobile) {
      setMobileToast(
        willBeOwned
          ? { message: messages.owned, variant: 'success' }
          : { message: messages.removed, variant: 'error' }
      );
    }
  }, [isOwned, toggleOwned, messages]);

  const clearMobileToast = useCallback(() => setMobileToast(null), []);

  return { mobileToast, clearMobileToast, handleToggleOwned };
}
