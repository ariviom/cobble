'use client';

import { Modal } from '@/app/components/ui/Modal';
import { StatusToggleButton } from '@/app/components/ui/StatusToggleButton';
import { cn } from '@/app/components/ui/utils';
import { useSetCollections } from '@/app/hooks/useSetCollections';
import { useSetStatus } from '@/app/hooks/useSetStatus';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { Check, Heart, ListPlus, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

export type SetDisplayCardProps = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts?: number;
  quantity?: number;
  /**
   * Optional label for the theme (e.g., root theme name). When provided, this
   * is rendered above the title.
   */
  themeLabel?: string | null;
  themeId?: number | null;
  onRemove?: () => void;
  className?: string;
};

function SetOwnershipAndCollectionsRow(props: {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts?: number;
  themeId?: number | null;
}) {
  const { setNumber, name, year, imageUrl, numParts, themeId } = props;
  const { user, isLoading } = useSupabaseUser();

  const { status, toggleStatus } = useSetStatus({
    setNumber,
    name,
    year,
    imageUrl,
    numParts: typeof numParts === 'number' ? numParts : 0,
    themeId: typeof themeId === 'number' ? themeId : null,
  });

  const {
    collections,
    selectedCollectionIds,
    isLoading: collectionsLoading,
    error,
    toggleCollection,
    createCollection,
  } = useSetCollections({ setNumber });

  const [showCollections, setShowCollections] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const handleCreateCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    createCollection(trimmed);
    setNewCollectionName('');
  };

  // Ownership & collections are account-only; hide row when not authenticated.
  if (isLoading || !user) {
    return null;
  }

  return (
    <>
      <div className="mt-2 flex border-t border-neutral-200 text-xs">
        <StatusToggleButton
          icon={<Check className="size-4" />}
          label="Owned"
          active={status.owned}
          onClick={() => toggleStatus('owned')}
        />
        <StatusToggleButton
          icon={<Heart className="size-4" />}
          label="Wishlist"
          active={status.wantToBuild}
          onClick={() => toggleStatus('wantToBuild')}
        />
        <StatusToggleButton
          icon={<Plus className="size-4" />}
          label="Collections"
          className="ml-auto"
          onClick={() => setShowCollections(true)}
        />
      </div>
      <Modal
        open={showCollections}
        title="Collections"
        onClose={() => setShowCollections(false)}
      >
        <div className="flex flex-col gap-2 text-xs">
          {collectionsLoading && (
            <div className="text-[10px] text-foreground-muted">Loading…</div>
          )}
          {collections.length > 0 && (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {collections.map(collection => {
                const selected = selectedCollectionIds.includes(collection.id);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    className={cn(
                      'flex items-center justify-between rounded px-2 py-1 text-left text-xs',
                      'hover:bg-neutral-50',
                      selected && 'bg-theme-primary/5 text-theme-primary'
                    )}
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleCollection(collection.id);
                    }}
                  >
                    <span className="flex items-center gap-1">
                      <ListPlus className="h-3 w-3" />
                      <span className="truncate">{collection.name}</span>
                    </span>
                    {selected && (
                      <Check className="h-3 w-3 shrink-0 text-theme-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1">
            <input
              type="text"
              value={newCollectionName}
              onChange={event => setNewCollectionName(event.target.value)}
              placeholder="New collection name"
              className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs"
            />
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                handleCreateCollection();
              }}
            >
              <Plus className="h-3 w-3" />
              <span>Create</span>
            </button>
          </div>
          {error && (
            <div className="mt-1 text-[10px] text-brand-red">{error}</div>
          )}
        </div>
      </Modal>
    </>
  );
}

export function SetDisplayCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  quantity,
  themeLabel,
  themeId,
  className,
}: SetDisplayCardProps) {
  // Infer metadata display: prefer numParts, fallback to quantity.
  const metadataParts: string[] = [setNumber, String(year)];
  if (typeof numParts === 'number' && Number.isFinite(numParts)) {
    metadataParts.push(`${numParts} parts`);
  } else if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    metadataParts.push(`${quantity} pieces`);
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-neutral-200 bg-white dark:bg-background ${className ?? ''}`}
    >
      <Link
        href={`/sets/${encodeURIComponent(setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-neutral-50">
            <div className="relative mx-auto w-full max-w-full bg-white p-2">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt=""
                  width={512}
                  height={512}
                  className="aspect-square h-full w-full overflow-hidden rounded-lg object-cover"
                />
              ) : (
                <div className="text-xs text-foreground-muted">No Image</div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              {themeLabel && (
                <div className="w-full text-sm font-medium text-foreground-muted">
                  {themeLabel}
                </div>
              )}
              <div className="line-clamp-1 w-full overflow-hidden font-medium">
                {name}
              </div>
              <div className="mt-1 w-full text-xs text-foreground-muted">
                {metadataParts.join(' | ')}
              </div>
            </div>
          </div>
        </div>
      </Link>
      <SetOwnershipAndCollectionsRow
        setNumber={setNumber}
        name={name}
        year={year}
        imageUrl={imageUrl}
        {...(typeof numParts === 'number' ? { numParts } : {})}
        themeId={themeId ?? null}
      />
    </div>
  );
}
