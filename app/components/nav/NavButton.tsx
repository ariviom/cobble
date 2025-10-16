'use client';

import { cx } from '@/app/components/ui/utils';
import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

type Props = {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  variant?: 'default' | 'ghost' | 'primary';
  disabled?: boolean;
  className?: string;
};

export function NavButton({
  icon,
  ariaLabel,
  onClick,
  href,
  disabled,
  className,
}: Props) {
  const base = cx(
    'flex h-topnav-height w-topnav-height items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-black transition-colors flex-shrink-0'
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cx(
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
      className={cx(base, className)}
    >
      {icon}
    </button>
  );
}
