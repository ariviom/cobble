'use client';

import { ReactNode, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ open, title, onClose, children }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 pt-4 pb-[calc(1rem+var(--spacing-nav-height))] lg:pt-[calc(1rem+var(--spacing-nav-height))] lg:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={e => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg border-t-[8px] border-theme-primary bg-card shadow-[0_8px_0_0_var(--color-shadow-depth)]"
        style={{ maxHeight: 'calc(100dvh - var(--spacing-nav-height) - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-subtle px-5 py-4">
          <h2 id={titleId} className="text-xl font-bold text-foreground">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
