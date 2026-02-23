'use client';

import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared dropdown state for control bars (inventory, search, collection).
 *
 * Handles:
 * - open/close state for a single dropdown at a time
 * - click-outside to close
 * - Escape key to close
 * - mobile body scroll lock when a dropdown is open
 *
 * @param options.keepOpenIds — dropdown IDs that should NOT be closed by
 *   outside clicks on desktop (e.g. sidebar panels like 'parent' / 'color')
 */
export function useControlBarDropdown(options?: { keepOpenIds?: string[] }): {
  openDropdownId: string | null;
  toggleDropdown: (id: string) => void;
  closeDropdown: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isDesktop: boolean;
} {
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const keepOpenIds = options?.keepOpenIds;

  const toggleDropdown = useCallback((id: string) => {
    setOpenDropdownId(prev => (prev === id ? null : id));
  }, []);

  const closeDropdown = useCallback(() => {
    setOpenDropdownId(null);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        // Keep sidebar panels open on desktop
        if (
          isDesktop &&
          keepOpenIds &&
          openDropdownId &&
          keepOpenIds.includes(openDropdownId)
        ) {
          return;
        }
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isDesktop, openDropdownId, keepOpenIds]);

  // Close dropdown on escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenDropdownId(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // When a bottom sheet is open on mobile, prevent document scrolling
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isDesktop) return;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    if (openDropdownId !== null) {
      root.style.overflow = 'hidden';
    }
    return () => {
      root.style.overflow = prevOverflow;
    };
  }, [openDropdownId, isDesktop]);

  return {
    openDropdownId,
    toggleDropdown,
    closeDropdown,
    containerRef,
    isDesktop,
  };
}
