'use client';

import { useEffect } from 'react';

const BASE_TITLE = 'Brick Party';
const DEFAULT_TITLE = `${BASE_TITLE} — LEGO Set Piece Picker`;

/**
 * Updates the browser tab title dynamically based on the provided title.
 * Restores the default title on unmount.
 *
 * @param title - The title to display (e.g., "75192-1 Millennium Falcon")
 *                If null/undefined, uses the default title.
 */
export function useDynamicTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) {
      document.title = `${title} | ${BASE_TITLE}`;
    } else {
      document.title = DEFAULT_TITLE;
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
