'use client';

import { cn } from '@/app/components/ui/utils';
import { ButtonHTMLAttributes, ReactNode } from 'react';

export type StatusToggleButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode;
    label: string;
    active?: boolean;
  };

const baseStyles =
  'inline-flex items-center w-full gap-1 rounded px-3 py-2 flex-col text-xs text-foreground-muted hover:bg-neutral-100 bg-neutral-50 border-r border-neutral-200 last:border-r-0';

const activeStyles =
  'border-theme-primary bg-theme-primary/5 text-theme-primary';

export function StatusToggleButton({
  icon,
  label,
  active = false,
  className,
  onClick,
  ...props
}: StatusToggleButtonProps) {
  return (
    <button
      type="button"
      className={cn(baseStyles, active && activeStyles, className)}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(event);
      }}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
