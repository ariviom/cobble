'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, cx, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
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
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  variant?: 'default' | 'sidebar';
};

const triggerVariants = cva(
  'min-w-max rounded-md border border-subtle bg-card px-3 py-1.5 text-sm cursor-pointer hover:bg-card-muted',
  {
    variants: {
      variant: {
        default: '',
        sidebar:
          'lg:sidebar:rounded-none lg:sidebar:border-x-0 lg:sidebar:border-t-0 lg:sidebar:border-b lg:sidebar:border-subtle lg:sidebar:text-base lg:sidebar:w-full lg:sidebar:py-3 lg:sidebar:px-4 text-left',
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
  { id, panelId, label, labelIcon, isOpen, onToggle, className, variant },
  ref
) {
  return (
    <button
      id={id}
      ref={ref}
      type="button"
      className={cn(triggerVariants({ variant }), className)}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={panelId}
      data-open={isOpen ? 'true' : undefined}
      onClick={onToggle}
    >
      <span className="inline-flex items-center gap-2">
        {labelIcon}
        <span>{label}</span>
      </span>
    </button>
  );
});

// Legacy DropdownPanel removed in favor of DropdownPanelFrame + composition

// Generic dropdown frame that accepts arbitrary children
const panelVariants = cva(
  // base: mobile behaves like a sheet, desktop like a popover
  'min-w-64 overflow-hidden rounded-md border border-subtle bg-card shadow-lg fixed top-[calc(var(--spacing-topnav-height)+var(--spacing-controls-height))] bottom-0 z-50 overflow-y-auto lg:absolute lg:top-full lg:right-0 lg:bottom-auto lg:left-0 lg:z-40',
  {
    variants: {
      variant: {
        default: '',
        sidebar:
          'inset-x-0 lg:sidebar:static lg:sidebar:inset-auto lg:sidebar:top-auto lg:sidebar:bottom-auto lg:sidebar:z-auto lg:sidebar:max-h-none lg:sidebar:overflow-visible lg:sidebar:shadow-none lg:sidebar:border-none',
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
  children: React.ReactNode;
};

export function DropdownSection({
  label,
  className,
  children,
}: DropdownSectionProps) {
  return (
    <div className={cx('', className)}>
      {label && (
        <div className="px-3 py-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
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
};

export function SingleSelectList({
  options,
  selectedKey,
  onChange,
}: SingleSelectListProps) {
  return (
    <div>
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
            <input
              type="checkbox"
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
        'flex items-center justify-end gap-2 border-t border-subtle bg-card px-3 py-2',
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

// Legacy ColorDropdownPanel removed in favor of CheckboxList inside DropdownPanelFrame
