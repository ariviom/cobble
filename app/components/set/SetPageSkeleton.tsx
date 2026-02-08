import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { cn } from '@/app/components/ui/utils';

type SetPageSkeletonProps = {
  /**
   * - `'set'` — full skeleton with sidebar, top bar, and loader (for set redirects)
   * - `'minimal'` — tab bar only, no content skeleton (for SSR/hydration)
   */
  variant?: 'set' | 'minimal';
};

/**
 * Skeleton layout for the set page grid.
 *
 * Used during:
 * - SSR/hydration before tabs load from localStorage (minimal variant)
 * - SetPageRedirector while redirecting from /sets/[setNumber] to /sets?active=... (set variant)
 */
export function SetPageSkeleton({ variant = 'set' }: SetPageSkeletonProps) {
  return (
    <div
      className={cn(
        'set-grid-layout min-h-[100dvh]',
        'lg:h-[calc(100dvh-var(--spacing-nav-offset))] lg:min-h-0 lg:overflow-hidden'
      )}
      data-has-tabs="true"
    >
      {/* Skeleton tab bar - same height as real tab bar */}
      <header className="sticky top-0 z-60 col-span-full bg-card lg:contents">
        <div className="flex h-[var(--grid-row-tabs)] items-center border-b border-subtle bg-card px-2 lg:col-span-full lg:row-start-1" />
      </header>

      {variant === 'set' && (
        <>
          {/* Main content skeleton with sidebar */}
          <div className="relative col-span-full lg:col-start-2 lg:row-start-2 lg:row-end-5 lg:flex lg:flex-col">
            {/* Skeleton top bar */}
            <div className="sticky top-10 z-50 shrink-0 bg-card lg:static">
              <div className="h-[var(--spacing-topbar-height,4rem)] border-b border-subtle" />
              <div className="h-[var(--spacing-controls-height)] border-b border-subtle bg-card-muted" />
            </div>
            {/* Skeleton content */}
            <div className="flex h-[50vh] items-center justify-center">
              <BrickLoader />
            </div>
          </div>

          {/* Skeleton sidebar - hidden on mobile, visible on desktop */}
          <div className="hidden lg:fixed lg:top-[calc(var(--spacing-nav-offset)+var(--grid-row-tabs,0px))] lg:left-0 lg:block lg:h-[calc(100dvh-var(--spacing-nav-offset)-var(--grid-row-tabs,0px))] lg:w-80 lg:border-r lg:border-subtle lg:bg-card" />
        </>
      )}
    </div>
  );
}
