import { cn } from '@/app/components/ui/utils';
import type { PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  className?: string;
}>;

export function TopNav({ children, className }: Props) {
  return (
    <div
      className={cn(
        'fixed top-0 right-0 z-30 h-topnav-height w-full border-b border-foreground-accent bg-neutral-00 lg:top-topnav-height lg:h-topnav-height-lg lg:w-[calc(100%-20rem)]',
        'flex items-center justify-between',
        'gap-0',
        'py-0'
      )}
    >
      <div
        className={cn('flex w-full items-center justify-between', className)}
      >
        {children}
      </div>
    </div>
  );
}
