'use client';

import { useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { Toast } from '@/app/components/ui/Toast';

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

/**
 * Emit a transient error toast from anywhere in the app.
 * The active ListToastProvider (mounted in layout.tsx) will render it.
 * No-ops silently if no provider is mounted (e.g. during SSR).
 */
export function emitListToast(message: string): void {
  for (const listener of listeners) {
    listener(message);
  }
}

type ToastState = { message: string; id: number } | null;

const TOAST_DISMISS_MS = 4000;

export function ListToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const listener: Listener = message => {
      idRef.current += 1;
      setToast({ message, id: idRef.current });
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      {children}
      {toast && (
        <Toast
          variant="error"
          description={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
