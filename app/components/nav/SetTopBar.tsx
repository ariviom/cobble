'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { cn } from '@/app/components/ui/utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useOwnedStore } from '@/app/store/owned';
import { ArrowLeft, ChevronDown, Download } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

type SetTopBarProps = {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
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
    'flex h-topnav-height w-topnav-height min-w-min flex-shrink-0 items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black'
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
      {label && <span className="hidden min-w-max lg:block">{label}</span>}
      {icon}
    </button>
  );
}

export function SetTopBar({ setNumber, setName, imageUrl }: SetTopBarProps) {
  const router = useRouter();
  const { computeMissingRows } = useInventory(setNumber);
  const [exportOpen, setExportOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const { isLoading, keys, required, totalRequired, totalMissing } =
    useInventory(setNumber);
  const ownedTotal = useMemo(
    () => totalRequired - totalMissing,
    [totalRequired, totalMissing]
  );
  const ownedStore = useOwnedStore();

  useEffect(() => {
    if (open) {
      document.body.classList.add('expanded-topnav');
    } else {
      document.body.classList.remove('expanded-topnav');
    }
  }, [open]);

  return (
    <>
      <div
        className={cn(
          'fixed top-0 right-0 z-30 flex h-topnav-height w-full items-center justify-between gap-0 border-b border-foreground-accent bg-neutral-00 py-0 transition-[height] lg:top-[var(--spacing-nav-height)] lg:w-[calc(100%-20rem)]'
        )}
      >
        <div className="flex w-full items-center justify-between">
          <NavButton
            className="absolute top-6 left-6 lg:hidden"
            ariaLabel="Go back"
            icon={<ArrowLeft className="h-5 w-5" />}
            onClick={() => router.back()}
          />
          <div className="relative h-full w-full pr-16 lg:pr-0">
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="flex h-full w-full items-center justify-between p-2"
              aria-expanded={open}
              aria-controls="setinfo-panel"
            >
              <div className="flex">
                {imageUrl ? (
                  <div className="mr-2 flex-shrink-0">
                    {/* aspect-square, fixed size, do not grow */}
                    <div className="aspect-squareoverflow-hidden h-full w-full rounded-sm border">
                      <Image
                        src={imageUrl}
                        alt="Set thumbnail"
                        width={92}
                        height={92}
                        className="aspect-square h-16 w-16 object-cover transition-[width,height] expanded-topnav:h-36 expanded-topnav:w-36 lg:expanded-topnav:h-48 lg:expanded-topnav:w-48"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mr-2 h-8 w-8 flex-shrink-0 rounded-sm border bg-neutral-100" />
                )}
                <div className="flex min-w-0 flex-col items-start text-left">
                  <div className="flex max-w-[40vw] items-center truncate text-sm font-medium sm:max-w-[50vw]">
                    {setName}
                    <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-foreground-muted" />
                  </div>
                  <div className="text-xs text-foreground-muted">
                    {isLoading
                      ? 'Computing…'
                      : `${ownedTotal} owned / ${totalMissing} missing`}
                  </div>
                </div>
              </div>
            </button>
            {/* {open && (
              <div
                id="setinfo-panel"
                className="absolute right-0 left-0 z-20 mt-2 rounded-md border bg-background p-3"
              >
                <div className="flex items-center gap-3">
                  {imageUrl ? (
                    <div className="h-16 w-16 overflow-hidden rounded-sm border">
                      <Image
                        src={imageUrl}
                        alt="Set thumbnail large"
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-sm border bg-neutral-100" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="truncate text-sm font-semibold">
                      {setName}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      {isLoading
                        ? 'Computing…'
                        : `${ownedTotal} owned / ${totalMissing} missing (of ${totalRequired})`}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
                    onClick={() => {
                      ownedStore.markAllAsOwned(setNumber, keys, required);
                      setOpen(false);
                    }}
                  >
                    Mark all owned
                  </button>
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1 text-sm hover:bg-neutral-100"
                    onClick={() => {
                      ownedStore.clearAll(setNumber);
                      setOpen(false);
                    }}
                  >
                    Mark none owned
                  </button>
                </div>
              </div>
            )} */}
          </div>
          <NavButton
            className="absolute top-0 right-0 lg:hidden"
            ariaLabel="Export missing"
            icon={<Download className="h-5 w-5" />}
            onClick={() => setExportOpen(true)}
          />
        </div>
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
