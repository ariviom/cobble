'use client';

import { useCallback, useEffect, useState } from 'react';

import { readStorage, writeStorage } from '@/app/lib/persistence/storage';
import { useTheme } from '@/app/hooks/useTheme';

const STORAGE_KEY = 'brick_party_image_knockout_v1';

export function useImageKnockout() {
  const { resolvedTheme } = useTheme();
  const [knockoutEnabled, setKnockoutEnabledState] = useState(false);

  useEffect(() => {
    setKnockoutEnabledState(readStorage(STORAGE_KEY) === 'true');
  }, []);

  const setKnockoutEnabled = useCallback((enabled: boolean) => {
    setKnockoutEnabledState(enabled);
    writeStorage(STORAGE_KEY, String(enabled));
    // Notify other components in the same tab (StorageEvent only fires cross-tab)
    window.dispatchEvent(
      new CustomEvent('knockout-change', { detail: enabled })
    );
  }, []);

  const isKnockoutAvailable = resolvedTheme === 'dark';
  const isKnockoutActive = isKnockoutAvailable && knockoutEnabled;

  return {
    knockoutEnabled,
    setKnockoutEnabled,
    /** True only when the current theme is dark (toggle should be visible) */
    isKnockoutAvailable,
    /** True when enabled AND in dark mode (filter should be rendered) */
    isKnockoutActive,
  };
}
