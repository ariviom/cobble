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
  'inline-flex items-center w-full gap-1 rounded px-3 py-2 flex-col text-xs text-foreground-muted bg-card hover:bg-card-muted border-r border-border-subtle last:border-r-0';

const activeStyles =
  'border-theme-primary bg-theme-primary/5 text-theme-primary';

const disabledStyles = 'opacity-60 cursor-not-allowed hover:bg-card';

export function StatusToggleButton({
  icon,
  label,
  active = false,
  className,
  onClick,
  disabled,
  ...props
}: StatusToggleButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        baseStyles,
        active && !disabled && activeStyles,
        disabled && disabledStyles,
        className
      )}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) return;
        onClick?.(event);
      }}
      disabled={disabled}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
