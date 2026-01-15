'use client';

import { cn } from '@/app/components/ui/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

export type NavLinkItemProps = {
  icon: ReactNode;
  ariaLabel: string;
  labelMobile: string;
  labelDesktop?: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
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
    // Base styles - chunky nav items on yellow background
    'relative flex flex-col items-center gap-0.5 rounded-[var(--radius-md)] px-3 py-2 transition-all duration-150 select-none lg:flex-row lg:gap-2 lg:px-4 lg:py-2.5',
    active
      ? // Active: White pill with warm shadow on yellow nav
        'bg-white font-bold text-neutral-900 shadow-[inset_0_-2px_0_0_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.1)]'
      : // Inactive: Dark text on yellow, white hover state
        'font-semibold text-neutral-800 hover:bg-white hover:text-neutral-900 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:bg-white active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]',
    className
  );

  const label = (
    <span className="text-[10px] font-bold tracking-wide uppercase lg:text-sm lg:font-semibold lg:tracking-normal lg:normal-case">
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
        {...(onClick
          ? {
              onClick: () => {
                onClick();
              },
            }
          : {})}
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
      {...(onClick
        ? {
            onClick: () => {
              onClick();
            },
          }
        : {})}
      className={classes}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
