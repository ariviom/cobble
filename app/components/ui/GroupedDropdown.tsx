'use client';

import { cx } from '@/app/components/ui/utils';
import { useEffect, useRef, useState } from 'react';

export type DropdownOption = {
  key: string;
  text: string;
  icon?: React.ReactNode;
};

export type DropdownGroup = {
  id: string;
  label: string;
  options: DropdownOption[];
  selectedKey?: string; // single-select
  className?: string; // allow class-based visibility control
};

export type GroupedDropdownProps = {
  groups: DropdownGroup[];
  onChange: (groupId: string, nextSelectedKey: string) => void;
  label: string;
  labelIcon?: React.ReactNode;
  className?: string;
  variant?: 'dropdown' | 'expanded';
};

export function GroupedDropdown({
  groups,
  onChange,
  label,
  labelIcon,
  className,
  variant = 'dropdown',
}: GroupedDropdownProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    if (variant !== 'dropdown') return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [variant]);

  if (variant === 'expanded') {
    return (
      <div
        className={cx('w-56 rounded border bg-white', className)}
        data-variant="expanded"
      >
        {groups.map(g => (
          <div
            key={g.id}
            className={cx('border-b last:border-b-0', g.className)}
            data-group-id={g.id}
          >
            <div className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              {g.label}
            </div>
            <div>
              {g.options.map(opt => {
                const selected = g.selectedKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={cx(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 selected:bg-blue-50 selected:text-blue-700',
                      selected
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-white text-gray-800'
                    )}
                    data-selected={selected ? 'true' : undefined}
                    onClick={() => onChange(g.id, opt.key)}
                  >
                    {opt.icon}
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  useEffect(() => {
    if (!open) return;
    const container = menuRef.current;
    if (!container) return;
    const triggerEl = container.querySelector('button');
    if (!triggerEl) return;
    const triggerRect = triggerEl.getBoundingClientRect();
    const menuWidth = 224; // w-56
    const wouldOverflow = triggerRect.left + menuWidth > window.innerWidth - 8;
    setAlignRight(wouldOverflow);
  }, [open]);

  return (
    <div
      className={cx('relative', className)}
      data-variant="dropdown"
      ref={menuRef}
    >
      <button
        type="button"
        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="inline-flex items-center gap-2">
          {labelIcon}
          <span>{label}</span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className={cx(
            'absolute z-20 mt-1 w-56 overflow-hidden rounded border bg-white shadow-lg',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
          {groups.map(g => (
            <div
              key={g.id}
              className={cx('border-b last:border-b-0', g.className)}
              data-group-id={g.id}
            >
              <div className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                {g.label}
              </div>
              <div>
                {g.options.map(opt => {
                  const selected = g.selectedKey === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={cx(
                        'block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 selected:bg-blue-50 selected:text-blue-700',
                        selected
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-white text-gray-800'
                      )}
                      data-selected={selected ? 'true' : undefined}
                      onClick={() => {
                        onChange(g.id, opt.key);
                        setOpen(false);
                      }}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
