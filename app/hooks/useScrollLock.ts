'use client';

import { useEffect } from 'react';

let lockCount = 0;

function lock() {
  lockCount++;
  if (lockCount === 1) {
    document.documentElement.style.overflow = 'hidden';
  }
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.style.overflow = '';
  }
}

/** Ref-counted document scroll lock. Safe with overlapping consumers. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return () => unlock();
  }, [active]);
}
