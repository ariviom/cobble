'use client';

import { useContrastingHeaderColor } from '@/app/hooks/useContrastingHeaderColor';
import type { ThemeColor } from '@/app/components/theme/constants';
import { cn } from '@/app/components/ui/utils';
import type { PropsWithChildren } from 'react';

type ThemedPageHeaderProps = PropsWithChildren<{
  /**
   * The preferred brand color for this header.
   * If this matches the user's theme color, an alternative will be used.
   */
  preferredColor: ThemeColor;
  /** Additional classes to apply */
  className?: string;
}>;

/**
 * A page header component that automatically picks a contrasting background color.
 *
 * Use this for page hero sections that have a brand-colored background. The component
 * ensures the background doesn't match the navbar (which uses the theme color).
 *
 * @example
 * <ThemedPageHeader preferredColor="blue" className="py-6">
 *   <h1>Search Sets</h1>
 * </ThemedPageHeader>
 */
export function ThemedPageHeader({
  preferredColor,
  className,
  children,
}: ThemedPageHeaderProps) {
  const { className: bgClass } = useContrastingHeaderColor(preferredColor);

  return <div className={cn(bgClass, className)}>{children}</div>;
}
