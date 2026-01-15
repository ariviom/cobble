'use client';

import { cn } from '@/app/components/ui/utils';
import { ButtonHTMLAttributes, ReactNode } from 'react';

export type StatusToggleButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: ReactNode;
    label: string;
    active?: boolean;
    variant?: 'default' | 'inline' | 'dropdown';
    /** Color scheme for active state: green (owned), orange (wishlist), blue (lists) */
    colorScheme?: 'green' | 'orange' | 'blue';
    /** Alias for colorScheme */
    color?: 'green' | 'orange' | 'blue';
  };

const baseStyles =
  'inline-flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-bold text-foreground-muted bg-card transition-all duration-150';

const defaultStyles =
  'flex-1 rounded-md border-2 border-subtle group-[.status-row]:flex-col hover:bg-background-muted';

const inlineStyles =
  'w-auto border-2 border-subtle flex-row hover:bg-background-muted hover:-translate-y-0.5 hover:shadow-sm';

const dropdownStyles = 'w-full min-w-max flex-row rounded-md py-2.5';

// Dropdown hover styles per color
const dropdownHoverGreen = 'hover:bg-brand-green/10 hover:text-brand-green';
const dropdownHoverOrange = 'hover:bg-brand-orange/10 hover:text-brand-orange';
const dropdownHoverBlue = 'hover:bg-brand-blue/10 hover:text-brand-blue';

const activeStylesGreen =
  'bg-brand-green/15 text-brand-green border-brand-green/40 shadow-[0_2px_0_0] shadow-brand-green/25';
const activeStylesOrange =
  'bg-brand-orange/15 text-brand-orange border-brand-orange/40 shadow-[0_2px_0_0] shadow-brand-orange/25';
const activeStylesBlue =
  'bg-brand-blue/15 text-brand-blue border-brand-blue/40 shadow-[0_2px_0_0] shadow-brand-blue/25';

const disabledStyles =
  'opacity-50 cursor-not-allowed hover:bg-card hover:translate-y-0';

function getActiveStyles(colorScheme: 'green' | 'orange' | 'blue' = 'green') {
  switch (colorScheme) {
    case 'orange':
      return activeStylesOrange;
    case 'blue':
      return activeStylesBlue;
    case 'green':
    default:
      return activeStylesGreen;
  }
}

function getDropdownHoverStyles(
  colorScheme: 'green' | 'orange' | 'blue' = 'green'
) {
  switch (colorScheme) {
    case 'orange':
      return dropdownHoverOrange;
    case 'blue':
      return dropdownHoverBlue;
    case 'green':
    default:
      return dropdownHoverGreen;
  }
}

// Auto-detect color scheme from label if not explicitly provided
function inferColorScheme(label: string): 'green' | 'orange' | 'blue' {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('owned') || lowerLabel.includes('have'))
    return 'green';
  if (lowerLabel.includes('wish') || lowerLabel.includes('want'))
    return 'orange';
  if (lowerLabel.includes('list') || lowerLabel.includes('collection'))
    return 'blue';
  return 'green';
}

export function StatusToggleButton({
  icon,
  label,
  active = false,
  className,
  onClick,
  disabled,
  variant = 'default',
  colorScheme,
  color,
  ...props
}: StatusToggleButtonProps) {
  const resolvedColorScheme = color ?? colorScheme ?? inferColorScheme(label);

  return (
    <button
      type="button"
      className={cn(
        baseStyles,
        variant === 'default' && defaultStyles,
        variant === 'inline' && inlineStyles,
        variant === 'dropdown' && dropdownStyles,
        variant === 'dropdown' &&
          !active &&
          !disabled &&
          getDropdownHoverStyles(resolvedColorScheme),
        active && !disabled && getActiveStyles(resolvedColorScheme),
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
