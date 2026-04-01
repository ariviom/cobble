'use client';

import { useThemeContext } from '@/app/components/providers/theme-provider';
import type { ThemeColor } from '@/app/components/theme/constants';

/**
 * Brand color to Tailwind class mapping.
 * In dark mode, hero backgrounds use darkened variants so they feel
 * cohesive with dark surfaces instead of blasting full-brightness color.
 */
const COLOR_CLASSES: Record<ThemeColor, string> = {
  blue: 'bg-brand-blue dark:bg-[var(--color-brand-blue-hero)]',
  purple: 'bg-brand-purple dark:bg-[var(--color-brand-purple-hero)]',
  green: 'bg-brand-green dark:bg-[var(--color-brand-green-hero)]',
  red: 'bg-brand-red dark:bg-[var(--color-brand-red-hero)]',
  yellow: 'bg-brand-yellow dark:bg-[var(--color-brand-yellow-hero)]',
};

/**
 * Fallback colors for each color when it matches the theme.
 * Chosen for good visual contrast and brand consistency.
 */
const FALLBACK_COLORS: Record<ThemeColor, ThemeColor> = {
  blue: 'purple',
  purple: 'blue',
  green: 'purple',
  red: 'purple',
  yellow: 'purple', // Yellow as theme is rare, purple provides good contrast
};

/**
 * Hook that returns a header background class that contrasts with the current theme.
 *
 * Use this when you have a preferred header color but need to ensure it doesn't
 * match the navbar (which uses the theme color).
 *
 * @param preferredColor - The brand color you'd ideally use for the header
 * @returns An object containing the CSS class and the resolved color name
 *
 * @example
 * const { className } = useContrastingHeaderColor('blue');
 * return <div className={className}>...</div>;
 */
export function useContrastingHeaderColor(preferredColor: ThemeColor): {
  className: string;
  color: ThemeColor;
} {
  const { themeColor } = useThemeContext();

  // If preferred color matches theme, use the fallback
  const resolvedColor =
    preferredColor === themeColor
      ? FALLBACK_COLORS[preferredColor]
      : preferredColor;

  return {
    className: COLOR_CLASSES[resolvedColor],
    color: resolvedColor,
  };
}
