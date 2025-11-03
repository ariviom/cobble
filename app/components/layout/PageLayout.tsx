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
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col pt-topnav-height',
        className
      )}
    >
      {topBar}
      <div className={cn('flex-1', contentWrapperClassName)}>
        <div className={cn('h-full w-full', contentClassName)}>{children}</div>
      </div>
    </div>
  );
}

