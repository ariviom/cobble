'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { cn } from '@/app/components/ui/utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useOwnedStore } from '@/app/store/owned';
import { ArrowLeft, ChevronDown, Download } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEventHandler, ReactNode } from 'react';
import { useState } from 'react';

type SetTopBarProps = {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

function NavButton({
  icon,
  ariaLabel,
  onClick,
  href,
  disabled,
  label,
  className,
}: NavButtonProps) {
  const base = cn(
    'group flex h-12 w-12 cursor-pointer items-center justify-center gap-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black lg:w-auto lg:pr-4'
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cn(
          base,
          disabled && 'pointer-events-none opacity-60',
          className
        )}
      >
        {label && (
          <span className="hidden min-w-max group-hover:underline lg:block">
            {label}
          </span>
        )}
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, className)}
    >
      {label && (
        <span className="hidden min-w-max group-hover:underline lg:block">
          {label}
        </span>
      )}
      {icon}
    </button>
  );
}

export function SetTopBar({
  setNumber,
  setName,
  imageUrl,
  expanded = false,
  onToggleExpanded,
}: SetTopBarProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    isLoading,
    keys,
    required,
    totalMissing,
    ownedTotal,
    computeMissingRows,
  } = useInventory(setNumber);
  const ownedStore = useOwnedStore();

  const handleToggleExpanded = () => {
    if (isDesktop) {
      onToggleExpanded?.();
    } else {
      setMobileOpen(prev => !prev);
    }
  };

  return (
    <>
      <div
        className={cn(
          'fixed top-0 right-0 z-60 flex h-topnav-height w-full items-center justify-between border-b border-foreground-accent',
          'lg:relative lg:h-full lg:w-full',
          !isDesktop && mobileOpen && 'expanded-topnav'
        )}
      >
        <NavButton
          className="absolute top-2 left-0 lg:top-0 lg:hidden"
          ariaLabel="Go back"
          icon={<ArrowLeft className="h-5 w-5" />}
          onClick={() => router.back()}
        />
        <div
          onClick={handleToggleExpanded}
          className="group set flex h-full w-full cursor-pointer gap-3 bg-background px-14 py-2 lg:px-2"
          role="button"
          aria-label="Open set information"
          aria-expanded={isDesktop ? expanded : false}
          aria-controls="setinfo-panel"
        >
          <div className="overflow-hidden rounded-sm border border-foreground-accent">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="Set thumbnail"
                width={240}
                height={240}
                className="h-full w-auto object-cover transition-transform"
              />
            ) : (
              <div className="flex size-[calc(var(--spacing-topnav-height)-1rem)] flex-shrink-0 items-center justify-center rounded-sm border bg-neutral-100">
                No Image
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-start text-left">
            <div className="lg:font-base flex h-5 shrink-0 origin-left items-center truncate text-sm font-medium lg:text-base">
              <span className="group-hover:underline">{setName}</span>
              <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-foreground-muted transition-transform expanded-topnav:rotate-180" />
            </div>
            <div className="text-xs text-foreground-muted lg:text-sm">
              {isLoading
                ? 'Computing…'
                : `${ownedTotal} owned / ${totalMissing} missing`}
            </div>
            {/* Set info panel */}
            <div
              id="setinfo-panel"
              className="absolute inset-x-0 bottom-0 -z-10 origin-top-left rounded-md border border-foreground-accent bg-background p-3 transition-transform lg:pointer-events-none lg:static lg:z-auto lg:!translate-y-0 lg:scale-75 lg:border-none lg:bg-transparent lg:p-0 lg:opacity-0 lg:transition-[transform,opacity] expanded-topnav:translate-y-full lg:expanded-topnav:pointer-events-auto lg:expanded-topnav:scale-100 lg:expanded-topnav:opacity-100"
            >
              <div className="lg:hidden">
                <Image
                  src={imageUrl ?? ''}
                  alt="Set thumbnail"
                  width={512}
                  height={512}
                />
              </div>
              <div className="mt-3 flex flex-col items-center gap-2 lg:flex-row">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
                  onClick={() => {
                    ownedStore.markAllAsOwned(setNumber, keys, required);
                    onToggleExpanded?.();
                  }}
                >
                  Mark all owned
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
                  onClick={() => {
                    ownedStore.clearAll(setNumber);
                    onToggleExpanded?.();
                  }}
                >
                  Mark none owned
                </button>
              </div>
            </div>
          </div>
        </div>
        <NavButton
          className="absolute top-2 right-0 lg:top-0"
          ariaLabel="Export missing"
          label="Parts List"
          icon={<Download className="h-5 w-5" />}
          onClick={() => setExportOpen(true)}
        />
      </div>
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        setNumber={setNumber}
        setName={setName}
        getMissingRows={computeMissingRows}
      />
    </>
  );
}

type NavButtonProps = {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
};
