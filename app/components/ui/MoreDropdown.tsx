'use client';

import MobileButtonHitArea from '@/app/components/ui/MobileButtonHitArea';
import { cn } from '@/app/components/ui/utils';
import { EllipsisVertical } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

type MoreDropdownButtonBaseProps = {
  icon: ReactNode;
  label: string;
  className?: string;
};

type MoreDropdownButtonButtonProps = MoreDropdownButtonBaseProps & {
  href?: undefined;
  onClick?: () => void;
};

type MoreDropdownButtonLinkHref = Parameters<typeof Link>[0]['href'];

type MoreDropdownButtonLinkProps = MoreDropdownButtonBaseProps & {
  href: MoreDropdownButtonLinkHref;
  onClick?: () => void;
};

export type MoreDropdownButtonProps =
  | MoreDropdownButtonButtonProps
  | MoreDropdownButtonLinkProps;

export function MoreDropdownButton(props: MoreDropdownButtonProps) {
  const { icon, label, className } = props;
  const sharedClassName = cn(
    'inline-flex w-36 min-w-max flex-row items-center gap-1 rounded border-r-0 bg-card px-3 py-2 text-xs text-foreground-muted hover:bg-card-muted',
    className
  );

  if ('href' in props && props.href) {
    const { href, onClick } = props;
    return (
      <Link
        href={href}
        className={sharedClassName}
        onClick={event => {
          event.stopPropagation();
          onClick?.();
        }}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  }

  const { onClick } = props;

  return (
    <button
      type="button"
      className={sharedClassName}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

type MoreDropdownProps = {
  ariaLabel?: string;
  className?: string;
  children: (helpers: { isOpen: boolean; toggle: () => void }) => ReactNode;
};

export function MoreDropdown({
  ariaLabel = 'More options',
  className,
  children,
}: MoreDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target;
      if (target instanceof Node && root.contains(target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggle = () => setIsOpen(prev => !prev);

  return (
    <div ref={rootRef} className={className || 'relative'}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen ? 'true' : 'false'}
        className="relative inline-flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-strong/30"
        onClick={toggle}
      >
        <MobileButtonHitArea />
        <EllipsisVertical className="size-5" />
      </button>
      {isOpen && (
        <div
          className="absolute right-0 -bottom-2 z-50 translate-y-full rounded-md border border-subtle bg-card shadow-lg"
          role="menu"
        >
          {children({ isOpen, toggle })}
        </div>
      )}
    </div>
  );
}
