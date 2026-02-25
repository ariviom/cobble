'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { forwardRef } from 'react';
import { Checkbox } from './Checkbox';
import { RowButton } from './RowButton';

export type DropdownOption = {
  key: string;
  text: string;
  icon?: React.ReactNode;
};

// Legacy types removed; now using composition primitives below

export type DropdownTriggerProps = {
  id: string;
  panelId: string;
  label: React.ReactNode;
  labelIcon?: React.ReactNode;
  /** Subtle secondary text shown beneath the label (e.g., current selection) */
  subLabel?: string | null | undefined;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  variant?: 'default' | 'sidebar';
  /** When disabled, the trigger is non-interactive and visually muted */
  disabled?: boolean | undefined;
};

const triggerVariants = cva(
  'rounded-md border-2 border-subtle bg-card px-4 py-2 text-sm font-semibold cursor-pointer transition-all duration-150 hover:bg-theme-primary/10 hover:border-theme-primary/30 data-[open]:bg-theme-primary/10 data-[open]:border-theme-primary min-w-max',
  {
    variants: {
      variant: {
        default: '',
        // min-w-0 overrides base min-w-max to allow truncation within fixed sidebar width
        sidebar:
          'lg:sidebar:rounded-none lg:sidebar:border-x-0 lg:sidebar:border-t-0 lg:sidebar:border-b-2 lg:sidebar:border-subtle lg:sidebar:text-base lg:sidebar:w-full lg:sidebar:min-w-0 lg:sidebar:py-3.5 lg:sidebar:px-4 text-left lg:sidebar:hover:bg-theme-primary/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export const DropdownTrigger = forwardRef<
  HTMLButtonElement,
  DropdownTriggerProps & VariantProps<typeof triggerVariants>
>(function DropdownTrigger(
  {
    id,
    panelId,
    label,
    labelIcon,
    subLabel,
    isOpen,
    onToggle,
    className,
    variant,
    disabled,
  },
  ref
) {
  return (
    <button
      id={id}
      ref={ref}
      type="button"
      className={cn(
        triggerVariants({ variant }),
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-disabled={disabled || undefined}
      data-open={isOpen ? 'true' : undefined}
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="inline-flex w-full items-center gap-2">
          {labelIcon}
          <span>{label}</span>
        </span>
        {subLabel && (
          <span className="inline-flex w-64 justify-start pl-6 text-xs font-normal text-foreground-muted">
            (<span className="inline-block truncate">{subLabel}</span>)
          </span>
        )}
      </span>
    </button>
  );
});

// Legacy DropdownPanel removed in favor of DropdownPanelFrame + composition

// Generic dropdown frame that accepts arbitrary children
const panelVariants = cva(
  'min-w-64 overflow-hidden rounded-t-lg border border-subtle bg-card shadow-none fixed top-[var(--sticky-header-bottom,calc(var(--spacing-topnav-height)+var(--spacing-controls-height)+var(--grid-row-tabs,0px)))] bottom-[var(--spacing-nav-height)] z-50 overflow-y-auto lg:rounded-lg lg:shadow-lg lg:absolute lg:top-full lg:right-0 lg:bottom-auto lg:left-0 lg:z-40 lg:max-h-[var(--spacing-dropdown-max-h)]',
  {
    variants: {
      variant: {
        default: '',
        sidebar:
          'inset-x-0 lg:sidebar:static lg:sidebar:inset-auto lg:sidebar:top-auto lg:sidebar:bottom-auto lg:sidebar:z-auto lg:sidebar:max-h-none lg:sidebar:overflow-visible lg:sidebar:shadow-none lg:sidebar:border-none lg:sidebar:rounded-none',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type DropdownPanelFrameProps = {
  id: string;
  labelledBy: string;
  isOpen: boolean;
  className?: string;
  hiddenWhenClosed?: boolean;
  variant?: 'default' | 'sidebar';
  children: React.ReactNode;
};

export function DropdownPanelFrame({
  id,
  labelledBy,
  isOpen,
  className,
  hiddenWhenClosed = true,
  variant = 'default',
  children,
}: DropdownPanelFrameProps) {
  return (
    <div
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      aria-hidden={isOpen ? undefined : 'true'}
      className={cn(
        panelVariants({ variant }),
        isOpen
          ? 'block'
          : hiddenWhenClosed
            ? 'hidden'
            : 'pointer-events-none opacity-0',
        className
      )}
      data-open={isOpen ? 'true' : undefined}
      data-dropdown-panel
    >
      {children}
    </div>
  );
}

// Section wrapper with a label header
export type DropdownSectionProps = {
  label?: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
};

export function DropdownSection({
  label,
  className,
  disabled,
  children,
}: DropdownSectionProps) {
  return (
    <div className={cx('', className, disabled && 'opacity-40')}>
      {label && (
        <div className="border-b border-subtle bg-background-muted/50 px-4 py-2.5 text-xs font-bold tracking-wide text-foreground-muted uppercase">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

// Single-select list for simple option picking
export type SingleSelectListProps = {
  options: DropdownOption[];
  selectedKey: string;
  onChange: (nextKey: string) => void;
  disabled?: boolean;
};

export function SingleSelectList({
  options,
  selectedKey,
  onChange,
  disabled,
}: SingleSelectListProps) {
  return (
    <div className={disabled ? 'pointer-events-none opacity-40' : undefined}>
      {options.map(option => {
        const selected = selectedKey === option.key;
        return (
          <RowButton
            key={option.key}
            selected={selected}
            onClick={() => onChange(option.key)}
          >
            {option.icon}
            <span>{option.text}</span>
            <Check
              size={16}
              className={cx(
                'ml-auto',
                selected ? 'text-foreground' : 'invisible'
              )}
            />
          </RowButton>
        );
      })}
    </div>
  );
}

// Checkbox-based multi-select list
export type CheckboxListProps = {
  options: DropdownOption[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
};

export function CheckboxList({
  options,
  selectedKeys,
  onToggle,
}: CheckboxListProps) {
  return (
    <div>
      {options.map(option => {
        const selected = selectedKeys.includes(option.key);
        return (
          <RowButton
            key={option.key}
            selected={selected}
            onClick={() => onToggle(option.key)}
          >
            <Checkbox
              checked={selected}
              onChange={() => {}}
              className="pointer-events-none"
              tabIndex={-1}
            />
            {option.icon}
            <span>{option.text}</span>
          </RowButton>
        );
      })}
    </div>
  );
}

// Grouped list of multiple single-select sections
export type GroupedListProps = {
  sections: Array<{
    id: string;
    label: string;
    options: DropdownOption[];
    selectedKey: string;
    onChange: (nextKey: string) => void;
  }>;
};

export function GroupedList({ sections }: GroupedListProps) {
  return (
    <>
      {sections.map(sec => (
        <DropdownSection key={sec.id} label={sec.label}>
          <SingleSelectList
            options={sec.options}
            selectedKey={sec.selectedKey}
            onChange={sec.onChange}
          />
        </DropdownSection>
      ))}
    </>
  );
}

export type DropdownFooterProps = {
  className?: string;
  children?: React.ReactNode;
};

export function DropdownFooter({ className, children }: DropdownFooterProps) {
  return (
    <div
      className={cx(
        'flex items-center justify-end gap-2 border-t border-subtle bg-background-muted/50 px-4 py-3',
        className
      )}
    >
      {children}
    </div>
  );
}

export function formatMultiSelectLabel(
  defaultLabel: string,
  selected: string[]
) {
  const count = selected?.length || 0;
  if (count === 0) return defaultLabel;
  if (count === 1) return selected[0]!;
  return `${defaultLabel} (${count})`;
}

/**
 * Formats a single selection label, handling special cases like emdash → Minifigures.
 */
function formatSelectionLabel(name: string): string {
  if (name === '-' || name === '—') return 'Minifigures';
  return name;
}

/**
 * Formats selections for display as a sub-label beneath the main label.
 * Returns null if no selections. Sorts by original list order and joins with commas.
 * CSS truncation should handle overflow.
 * @param selected - Array of selected item names
 * @param allOptions - Original options list to determine display order
 */
export function formatSelectionSubLabel(
  selected: string[],
  allOptions: string[]
): string | null {
  const count = selected?.length || 0;
  if (count === 0) return null;

  // Sort selected items by their position in the original options list
  const sorted = [...selected].sort(
    (a, b) => allOptions.indexOf(a) - allOptions.indexOf(b)
  );

  return sorted.map(formatSelectionLabel).join(', ');
}

// Legacy ColorDropdownPanel removed in favor of CheckboxList inside DropdownPanelFrame
