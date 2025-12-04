'use client';

import { cn } from '@/app/components/ui/utils';
import { ButtonHTMLAttributes, ReactNode } from 'react';

export type StatusToggleButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode;
    label: string;
    active?: boolean;
    variant?: 'default' | 'inline';
  };

const baseStyles =
  'inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs text-foreground-muted bg-card hover:bg-card-muted';

const defaultStyles =
  'w-full border-r border-subtle last:border-r-0 group-[.status-row]:flex-col';

const inlineStyles = 'w-auto border border-subtle flex-row';

const activeStyles = 'bg-theme-primary/10 text-theme-primary';

const disabledStyles = 'opacity-60 cursor-not-allowed hover:bg-card';

export function StatusToggleButton({
  icon,
  label,
  active = false,
  className,
  onClick,
  disabled,
  variant = 'default',
  ...props
}: StatusToggleButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        baseStyles,
        variant === 'default' && defaultStyles,
        variant === 'inline' && inlineStyles,
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
