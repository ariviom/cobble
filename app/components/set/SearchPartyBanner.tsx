'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export function SearchPartyBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border-2 border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <strong>Search Party is experimental.</strong> Limited to 8
        participants. Connection issues may occur. Your progress syncs in
        real-time but reconnection handling is still being improved.
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 hover:bg-amber-500/20"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
