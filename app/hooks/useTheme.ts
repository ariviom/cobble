import { useThemeContext } from '@/app/components/providers/theme-provider';
import type {
  ResolvedTheme,
  ThemeColor,
  ThemePreference,
} from '@/app/components/theme/constants';

export type { ThemePreference, ResolvedTheme, ThemeColor };

export function useTheme() {
  return useThemeContext();
}
