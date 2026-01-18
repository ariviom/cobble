export const USER_THEME_KEY = 'userTheme';
export const USER_THEME_COLOR_KEY = 'userThemeColor';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type ThemeColor = 'blue' | 'yellow' | 'purple' | 'red' | 'green';

export const DEFAULT_THEME_COLOR: ThemeColor = 'blue';

export const THEME_COLOR_TO_VALUE: Record<ThemeColor, string> = {
  blue: 'var(--color-brand-blue)',
  yellow: 'var(--color-brand-yellow)',
  purple: 'var(--color-brand-purple)',
  red: 'var(--color-brand-red)',
  green: 'var(--color-brand-green)',
};

/**
 * Actual hex values for server-side rendering.
 * Used to set CSS variables before hydration to prevent theme flash.
 */
export const THEME_COLOR_HEX: Record<ThemeColor, string> = {
  blue: '#016cb8',
  yellow: '#f2d300',
  purple: '#4d2f93',
  red: '#e3000b',
  green: '#00b242',
};

/**
 * Theme text colors for readable text on backgrounds.
 * Yellow needs a darker amber for light mode contrast.
 */
export const THEME_TEXT_COLORS_LIGHT: Record<ThemeColor, string> = {
  blue: '#016cb8',
  yellow: '#996f00', // Dark amber for readability on light backgrounds
  purple: '#4d2f93',
  red: '#c30009',
  green: '#008732',
};

/**
 * Theme text colors for dark mode - lighter, more vibrant versions.
 */
export const THEME_TEXT_COLORS_DARK: Record<ThemeColor, string> = {
  blue: '#60a5fa', // Lighter blue for dark backgrounds
  yellow: '#fbbf24', // Warm amber
  purple: '#a78bfa', // Lighter purple
  red: '#f87171', // Lighter red
  green: '#4ade80', // Lighter green
};

/**
 * Text color on theme-colored backgrounds (for buttons, badges, etc.)
 */
export const THEME_CONTRAST_TEXT: Record<ThemeColor, string> = {
  blue: '#ffffff',
  yellow: '#1a1600', // Dark text on yellow backgrounds
  purple: '#ffffff',
  red: '#ffffff',
  green: '#ffffff',
};
