'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '@/app/hooks/useScrollLock';
import { X } from 'lucide-react';

type Props = {
  mobileSrc: string;
  desktopSrc: string;
  open: boolean;
  onClose: () => void;
};

export function VideoLightbox({ mobileSrc, desktopSrc, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useScrollLock(open);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Video preview"
    >
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative flex max-h-[90dvh] max-w-4xl items-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-sm text-white/80 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="max-h-[85dvh] w-auto rounded-lg shadow-2xl"
        >
          <source
            src={desktopSrc}
            media="(min-width: 1024px)"
            type="video/mp4"
          />
          <source src={mobileSrc} type="video/mp4" />
        </video>
      </div>
    </div>,
    document.body
  );
}
