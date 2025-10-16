'use client';

import { cx } from '@/app/components/ui/utils';
import { forwardRef } from 'react';

export type DropdownOption = {
  key: string;
  text: string;
  icon?: React.ReactNode;
};

export type DropdownGroup = {
  id: string;
  label: string;
  options: DropdownOption[];
  selectedKey?: string;
  className?: string;
};

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
        'rounded-lg border border-foreground-accent bg-neutral-00 px-3 py-1.5 text-sm',
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

export type DropdownPanelProps = {
  id: string;
  labelledBy: string;
  isOpen: boolean;
  groups: DropdownGroup[];
  onChange: (groupId: string, nextSelectedKey: string) => void;
  className?: string;
  hiddenWhenClosed?: boolean;
};

export function DropdownPanel({
  id,
  labelledBy,
  isOpen,
  groups,
  onChange,
  className,
  hiddenWhenClosed = true,
}: DropdownPanelProps) {
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
      {groups.map(group => (
        <div
          key={group.id}
          className={cx('border-b last:border-b-0', group.className)}
          data-group-id={group.id}
        >
          <div className="px-3 py-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
            {group.label}
          </div>
          <div>
            {group.options.map(option => {
              const selected = group.selectedKey === option.key;
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
                  onClick={() => onChange(group.id, option.key)}
                >
                  {option.icon}
                  <span>{option.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
