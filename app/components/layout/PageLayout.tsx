import { Navigation } from '@/app/components/nav/Navigation';
import { cn } from '@/app/components/ui/utils';
import type { PropsWithChildren, ReactNode } from 'react';

type PageLayoutProps = PropsWithChildren<{
  topBar: ReactNode;
  className?: string;
  contentWrapperClassName?: string;
  contentClassName?: string;
}>;

export function PageLayout({
  topBar,
  className,
  contentWrapperClassName,
  contentClassName,
  children,
}: PageLayoutProps) {
  return (
    <div className="flex max-h-screen w-full flex-col overflow-hidden">
      <Navigation className="order-last w-full lg:order-first" />
      <div
        className={cn(
          'flex h-full min-h-0 flex-1 shrink flex-col lg:pb-0',
          className
        )}
      >
        {topBar}
        <div
          className={cn(
            'h-[calc(100dvh-var(--spacing-nav-height))] w-full pt-topnav-height lg:pt-0',
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
