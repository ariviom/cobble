'use client';

import { cn } from '@/app/components/ui/utils';
import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

export type NavLinkItemProps = {
  icon: ReactNode;
  ariaLabel: string;
  labelMobile: string;
  labelDesktop?: string;
  active: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  className?: string;
};

export function NavLinkItem({
  icon,
  ariaLabel,
  labelMobile,
  labelDesktop,
  active,
  href,
  onClick,
  className,
}: NavLinkItemProps) {
  const classes = cn(
    'flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition-colors lg:flex-row lg:gap-2 lg:rounded-md',
    active
      ? 'text-foreground lg:bg-neutral-100'
      : 'text-foreground-muted hover:bg-neutral-100',
    className
  );

  const label = (
    <span className="text-xs font-medium lg:text-sm">
      <span className="lg:hidden">{labelMobile}</span>
      <span className="hidden lg:inline">{labelDesktop ?? labelMobile}</span>
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={classes}
      >
        {icon}
        {label}
      </Link>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={classes}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
