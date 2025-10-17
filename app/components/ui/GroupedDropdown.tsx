'use client';

import { cx } from '@/app/components/ui/utils';
import { forwardRef } from 'react';

export type DropdownOption = {
  key: string;
  text: string;
  icon?: React.ReactNode;
};

// Legacy types removed; now using composition primitives below

export type DropdownTriggerProps = {
  id: string;
  panelId: string;
  label: string;
  labelIcon?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
};

export const DropdownTrigger = forwardRef<
  HTMLButtonElement,
  DropdownTriggerProps
>(function DropdownTrigger(
  { id, panelId, label, labelIcon, isOpen, onToggle, className },
  ref
) {
  return (
    <button
      id={id}
      ref={ref}
      type="button"
      className={cx(
        'min-w-fit rounded-lg border border-foreground-accent bg-neutral-00 px-3 py-1.5 text-sm',
        className
      )}
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
export type DropdownPanelFrameProps = {
  id: string;
  labelledBy: string;
  isOpen: boolean;
  className?: string;
  hiddenWhenClosed?: boolean;
  children: React.ReactNode;
};

export function DropdownPanelFrame({
  id,
  labelledBy,
  isOpen,
  className,
  hiddenWhenClosed = true,
  children,
}: DropdownPanelFrameProps) {
  return (
    <div
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      aria-hidden={isOpen ? undefined : 'true'}
      className={cx(
        'overflow-hidden rounded border border-foreground-accent bg-background shadow-lg',
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
  label: string;
  className?: string;
  children: React.ReactNode;
};

export function DropdownSection({
  label,
  className,
  children,
}: DropdownSectionProps) {
  return (
    <div className={cx('border-b last:border-b-0', className)}>
      <div className="px-3 py-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        {label}
      </div>
      <div>{children}</div>
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
          <button
            key={option.key}
            type="button"
            className={cx(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 selected:bg-blue-50 selected:text-blue-700',
              selected
                ? 'bg-blue-50 text-blue-700'
                : 'bg-background text-foreground'
            )}
            data-selected={selected ? 'true' : undefined}
            onClick={() => onChange(option.key)}
          >
            {option.icon}
            <span>{option.text}</span>
          </button>
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
          <button
            key={option.key}
            type="button"
            className={cx(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100',
              selected
                ? 'bg-blue-50 text-blue-700'
                : 'bg-background text-foreground'
            )}
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
          </button>
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
        'flex items-center justify-end gap-2 border-t px-3 py-2',
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
