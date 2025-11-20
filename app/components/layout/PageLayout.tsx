import { Navigation } from '@/app/components/nav/Navigation';
import { cn } from '@/app/components/ui/utils';
import type { PropsWithChildren, ReactNode } from 'react';

type PageLayoutProps = PropsWithChildren<{
  topBar?: ReactNode;
  noPadding?: boolean;
  className?: string;
}>;

export function PageLayout({
  topBar,
  noPadding,
  className,
  children,
}: PageLayoutProps) {
  return (
    <>
      <main
        className={cn(
          'min-h-screen w-full pb-[var(--spacing-nav-height)] lg:pt-[var(--spacing-nav-height)] lg:pb-0',
          noPadding ? '' : 'px-4',
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
