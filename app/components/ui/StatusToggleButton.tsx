'use client';

import { cn } from '@/app/components/ui/utils';
import { ChevronDown } from 'lucide-react';
import { ButtonHTMLAttributes, ReactNode } from 'react';

export type StatusToggleButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: ReactNode;
    label: string;
    /** Optional sublabel shown below the main label in muted text */
    sublabel?: string | null;
    active?: boolean;
    variant?: 'default' | 'inline' | 'dropdown';
    /** Color scheme for active state: green (owned), orange (wishlist), blue (lists) */
    colorScheme?: 'green' | 'orange' | 'blue';
    /** Alias for colorScheme */
    color?: 'green' | 'orange' | 'blue';
    /** Show a chevron down icon on the right (for dropdown-like buttons) */
    showChevron?: boolean;
    /** Use w-fit instead of flex-1 for compact sizing */
    compact?: boolean;
    /** Hide the label text on mobile (icon-only), useful for space-constrained layouts */
    hideLabelOnMobile?: boolean;
    /** Hide the icon on mobile (text-only), useful for space-constrained layouts */
    hideIconOnMobile?: boolean;
  };

const baseStyles =
  'inline-flex h-12 items-center gap-2.5 rounded-lg px-2.5 text-xs font-bold text-foreground-muted bg-card transition-all duration-150';

const defaultStyles =
  'flex-1 rounded-lg border border-subtle hover:bg-background-muted';

const compactStyles = 'w-fit flex-none';

const inlineStyles =
  'w-auto border border-subtle flex-row hover:bg-background-muted hover:-translate-y-0.5 hover:shadow-sm';

const dropdownStyles = 'w-full min-w-max flex-row rounded-lg py-2.5';

// Dropdown hover styles per color
const dropdownHoverGreen = 'hover:bg-brand-green/10 hover:text-brand-green';
const dropdownHoverOrange = 'hover:bg-brand-orange/10 hover:text-brand-orange';
const dropdownHoverBlue = 'hover:bg-brand-blue/10 hover:text-brand-blue';

const activeStylesGreen =
  'bg-brand-green/15 text-brand-green border-brand-green/40';
const activeStylesOrange =
  'bg-brand-orange/15 text-brand-orange border-brand-orange/40';
const activeStylesBlue =
  'bg-brand-blue/15 text-brand-blue border-brand-blue/40';

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
  sublabel,
  active = false,
  className,
  onClick,
  disabled,
  variant = 'default',
  colorScheme,
  color,
  showChevron = false,
  compact = false,
  hideLabelOnMobile = false,
  hideIconOnMobile = false,
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
        compact && compactStyles,
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
      {icon && (
        <span className={cn(hideIconOnMobile && 'hidden sm:inline')}>
          {icon}
        </span>
      )}
      <span
        className={cn(
          'flex min-w-0 flex-col items-start',
          hideLabelOnMobile && 'hidden sm:flex'
        )}
      >
        <span>{label}</span>
        {sublabel && (
          <span className="max-w-[120px] truncate text-[10px] font-medium text-neutral-400">
            {sublabel}
          </span>
        )}
      </span>
      {showChevron && (
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-foreground-muted" />
      )}
    </button>
  );
}
