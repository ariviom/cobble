'use client';

import { cn } from '@/app/components/ui/utils';
import type { MouseEventHandler, ReactNode } from 'react';

export type NavLinkItemProps = {
  icon: ReactNode;
  ariaLabel: string;
  labelMobile: string;
  labelDesktop?: string;
  active: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
};

export function NavLinkItem({
  icon,
  ariaLabel,
  labelMobile,
  labelDesktop,
  active,
  onClick,
  className,
}: NavLinkItemProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition-colors lg:flex-row lg:gap-2 lg:rounded-md',
        active
          ? 'text-foreground lg:bg-neutral-100'
          : 'text-foreground-muted hover:bg-neutral-100',
        className
      )}
    >
      {icon}
      <span className="text-xs font-medium lg:text-sm">
        <span className="lg:hidden">{labelMobile}</span>
        <span className="hidden lg:inline">{labelDesktop ?? labelMobile}</span>
      </span>
    </button>
  );
}
