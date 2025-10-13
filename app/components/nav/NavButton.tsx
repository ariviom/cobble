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
  variant = 'default',
  disabled,
  className,
}: Props) {
  const base = cx(
    'flex h-10 w-10 items-center justify-center',
    'rounded-md',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
    'transition-colors',
    'flex-shrink-0'
  );
  const styles =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
      : variant === 'ghost'
        ? 'text-gray-700 hover:bg-gray-100'
        : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50';

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cx(
          base,
          styles,
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
      className={cx(base, styles, disabled && 'opacity-60', className)}
    >
      {icon}
    </button>
  );
}
