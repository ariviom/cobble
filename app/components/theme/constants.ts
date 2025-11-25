export const USER_THEME_KEY = 'userTheme';
export const DEVICE_THEME_KEY = 'deviceTheme';
export const USER_THEME_COLOR_KEY = 'userThemeColor';
export const DEVICE_THEME_COLOR_KEY = 'deviceThemeColor';

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

