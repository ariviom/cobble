import { Navigation } from '@/app/components/nav/Navigation';
import { cn } from '@/app/components/ui/utils';
import type { PropsWithChildren, ReactNode } from 'react';

type PageLayoutProps = PropsWithChildren<{
  topBar?: ReactNode;
  className?: string;
  /** Constrain height on desktop to prevent document scroll (for pages with their own scroll container) */
  constrainHeight?: boolean;
}>;

export function PageLayout({
  topBar,
  className,
  constrainHeight,
  children,
}: PageLayoutProps) {
  return (
    <>
      <main
        className={cn(
          'min-h-screen w-full pb-[var(--spacing-nav-height)] lg:pt-[var(--spacing-nav-offset)] lg:pb-0',
          constrainHeight && 'lg:h-screen lg:overflow-hidden',
          className
        )}
      >
        {topBar}
        {children}
      </main>
      <Navigation className="w-full" />
    </>
  );
}
