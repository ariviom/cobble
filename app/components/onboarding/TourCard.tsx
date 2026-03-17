'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useOnboarding } from '@/app/hooks/useOnboarding';
import { useOnboardingSync } from '@/app/hooks/useOnboardingSync';
import { useOnboardingStore } from '@/app/store/onboarding';
import { TourSignupPrompt } from './TourSignupPrompt';
import { TourChecklist } from './TourChecklist';
import { TourItemModal } from './TourItemModal';
import type { TourItem } from './tourConfig';

/** Routes where the tour card should never appear. */
const HIDDEN_ROUTES = new Set(['/', '/login', '/signup']);

export function TourCard() {
  const pathname = usePathname();
  const { user, isLoading } = useSupabaseUser();
  const {
    dismissed,
    collapsed,
    dismiss,
    collapse,
    expand,
    isComplete,
    progress,
  } = useOnboarding();
  const hydrated = useOnboardingStore(s => s._hydrated);

  // Activate Supabase sync
  useOnboardingSync();

  // Hydrate from localStorage for anonymous users
  useEffect(() => {
    if (!user && !isLoading) {
      useOnboardingStore.getState().hydrate();
    }
  }, [user, isLoading]);

  const [selectedItem, setSelectedItem] = useState<TourItem | null>(null);
  const [showDismissedNote, setShowDismissedNote] = useState(false);

  // Don't render on hidden routes (e.g. marketing landing page)
  if (HIDDEN_ROUTES.has(pathname)) return null;

  // Don't render until auth check and onboarding hydration are both done
  if (isLoading || !hydrated) return null;

  // Completed + dismissed = permanently hidden
  if (isComplete() && dismissed) return null;

  // Completed but not yet dismissed = show completion message
  if (isComplete()) {
    return (
      <TourCardShell>
        <div className="flex items-center justify-between p-4">
          <p className="text-sm font-medium text-foreground">
            You&apos;re all set!
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-foreground-muted hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </TourCardShell>
    );
  }

  // Dismissed state — show note briefly, then hide
  if (dismissed && !showDismissedNote) return null;
  if (dismissed && showDismissedNote) {
    return (
      <TourCardShell>
        <div className="flex items-center justify-between p-4">
          <p className="text-xs text-foreground-muted">
            Re-enable the tour in Account Settings.
          </p>
          <button
            type="button"
            onClick={() => setShowDismissedNote(false)}
            className="text-xs text-foreground-muted hover:text-foreground"
          >
            Got it
          </button>
        </div>
      </TourCardShell>
    );
  }

  // Collapsed state
  if (collapsed) {
    const { completed, total } = progress();
    return (
      <TourCardShell>
        <button
          type="button"
          onClick={expand}
          className="flex w-full items-center justify-between p-3"
        >
          <span className="text-sm font-medium text-foreground">
            Brick Party Tour
          </span>
          <span className="text-xs text-foreground-muted">
            {completed}/{total} complete
          </span>
        </button>
      </TourCardShell>
    );
  }

  const handleDismiss = () => {
    dismiss();
    setShowDismissedNote(true);
  };

  // Anonymous state
  if (!user) {
    return (
      <TourCardShell>
        <TourSignupPrompt onDismiss={handleDismiss} />
      </TourCardShell>
    );
  }

  // Authenticated — full checklist
  return (
    <>
      <TourCardShell>
        <TourChecklist
          onItemClick={setSelectedItem}
          onDismiss={handleDismiss}
          onCollapse={collapse}
        />
      </TourCardShell>
      <TourItemModal
        item={selectedItem}
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}

function TourCardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed right-0 bottom-[var(--spacing-nav-height)] left-0 z-70 border-t border-subtle bg-card shadow-lg lg:right-4 lg:bottom-4 lg:left-auto lg:w-96 lg:rounded-lg lg:border">
      {children}
    </div>
  );
}
