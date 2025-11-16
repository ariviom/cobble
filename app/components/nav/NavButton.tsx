'use client';

import { cn } from '@/app/components/ui/utils';
import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

type Props = {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  variant?: 'default' | 'ghost' | 'primary';
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function NavButton({
  icon,
  ariaLabel,
  onClick,
  href,
  disabled,
  label,
  className,
}: Props) {
  const base = cn(
    'flex h-topnav-height w-topnav-height min-w-min flex-shrink-0 items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black'
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cn(
          base,
          disabled && 'pointer-events-none opacity-60',
          className
        )}
      >
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, className)}
    >
      {label && <span className="hidden min-w-max lg:block">{label}</span>}
      {icon}
    </button>
  );
}
