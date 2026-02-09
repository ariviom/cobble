'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { cn } from '@/app/components/ui/utils';
import {
  Check,
  EllipsisVertical,
  ListPlus,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export type CollectionItem = {
  id: string;
  name: string;
  isSystem: boolean;
};

type CollectionsModalContentProps = {
  lists: CollectionItem[];
  selectedListIds: string[];
  isLoading: boolean;
  error: string | null;
  onToggle: (listId: string) => void;
  onCreate: (name: string) => void;
  onRename: (listId: string, newName: string) => void;
  onDelete: (listId: string) => void;
};

export function CollectionsModalContent({
  lists,
  selectedListIds,
  isLoading,
  error,
  onToggle,
  onCreate,
  onRename,
  onDelete,
}: CollectionsModalContentProps) {
  const [newCollectionName, setNewCollectionName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingCollection, setDeletingCollection] =
    useState<CollectionItem | null>(null);
  const [menuOpen, setMenuOpen] = useState<{
    id: string;
    top: number;
  } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  // Sort: system first, then alphabetical
  const sortedLists = useMemo(() => {
    const system = lists.filter(l => l.isSystem);
    const custom = lists.filter(l => !l.isSystem);
    return [...system, ...custom];
  }, [lists]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Focus edit input when entering rename mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const startRename = (collection: CollectionItem) => {
    setEditingId(collection.id);
    setEditingName(collection.name);
    setMenuOpen(null);
  };

  const confirmRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    const original = lists.find(l => l.id === editingId);
    if (trimmed && trimmed !== original?.name) {
      onRename(editingId, trimmed);
    }
    setEditingId(null);
    setEditingName('');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingName('');
  };

  const startDelete = (collection: CollectionItem) => {
    setDeletingCollection(collection);
    setMenuOpen(null);
  };

  const confirmDelete = () => {
    if (!deletingCollection) return;
    onDelete(deletingCollection.id);
    setDeletingCollection(null);
  };

  const cancelDelete = () => {
    setDeletingCollection(null);
  };

  const handleCreate = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewCollectionName('');
  };

  // Delete confirmation view
  if (deletingCollection) {
    return (
      <div className="flex flex-col gap-4">
        <div className="py-2 text-center">
          <div className="text-sm text-foreground">
            Delete{' '}
            <span className="font-bold">
              &ldquo;{deletingCollection.name}&rdquo;
            </span>
            ?
          </div>
          <p className="mt-2 text-xs text-foreground-muted">
            This collection and all its saved items will be permanently removed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="md"
            className="flex-1"
            onClick={cancelDelete}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="md"
            className="flex-1 gap-1.5"
            onClick={confirmDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    );
  }

  // Normal collection list view
  return (
    <div className="flex flex-col gap-4">
      {isLoading && sortedLists.length === 0 && (
        <div className="flex items-center justify-center py-4 text-sm text-foreground-muted">
          Loading collections&hellip;
        </div>
      )}
      {sortedLists.length > 0 && (
        <div ref={listWrapperRef} className="relative">
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
            {sortedLists.map(collection => {
              const selected = selectedListIds.includes(collection.id);
              const Icon = collection.isSystem ? Star : ListPlus;
              const isEditing = editingId === collection.id;

              return (
                <div key={collection.id} className="flex items-center gap-1">
                  {isEditing ? (
                    // Rename mode
                    <div
                      className={cn(
                        'flex flex-1 items-center gap-2 rounded-md border-2 px-3 py-2.5',
                        'border-theme-primary bg-theme-primary/10'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-foreground-muted" />
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') confirmRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm font-bold text-foreground outline-none"
                      />
                      <button
                        type="button"
                        onClick={cancelRename}
                        className="shrink-0 rounded p-1 text-foreground-muted hover:text-foreground"
                        aria-label="Cancel rename"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={confirmRename}
                        className="shrink-0 rounded p-1 text-theme-text"
                        aria-label="Confirm rename"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    // Normal mode
                    <>
                      <button
                        type="button"
                        className={cn(
                          'flex flex-1 items-center justify-between rounded-md border-2 px-4 py-3 text-left text-sm font-bold transition-all duration-150',
                          selected
                            ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                            : 'border-subtle bg-card text-foreground hover:-translate-y-0.5 hover:bg-background-muted hover:shadow-sm'
                        )}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggle(collection.id);
                        }}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{collection.name}</span>
                        </span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-theme-text" />
                        )}
                      </button>
                      {!collection.isSystem && (
                        <button
                          type="button"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (menuOpen?.id === collection.id) {
                              setMenuOpen(null);
                              return;
                            }
                            const btnRect =
                              e.currentTarget.getBoundingClientRect();
                            const wrapperRect =
                              listWrapperRef.current?.getBoundingClientRect();
                            const top = wrapperRect
                              ? btnRect.bottom - wrapperRect.top + 4
                              : 0;
                            setMenuOpen({ id: collection.id, top });
                          }}
                          aria-label={`Options for ${collection.name}`}
                        >
                          <EllipsisVertical className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {menuOpen &&
            (() => {
              const collection = lists.find(l => l.id === menuOpen.id);
              if (!collection) return null;
              return (
                <div
                  ref={menuRef}
                  className="absolute right-0 z-50 min-w-[140px] rounded-md border-2 border-subtle bg-card py-1 shadow-lg"
                  style={{ top: menuOpen.top }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      startRename(collection);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/5"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      startDelete(collection);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              );
            })()}
        </div>
      )}
      {sortedLists.length === 0 && !isLoading && (
        <div className="py-4 text-center text-sm text-foreground-muted">
          No collections yet. Create one below!
        </div>
      )}
      <div className="flex items-end gap-2 border-t-2 border-subtle pt-4">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-bold tracking-wide text-foreground-muted uppercase">
            New Collection
          </label>
          <Input
            value={newCollectionName}
            onChange={e => setNewCollectionName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
            }}
            placeholder="Collection name"
            size="md"
          />
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            handleCreate();
          }}
          disabled={!newCollectionName.trim()}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Create
        </Button>
      </div>
      {error && (
        <div className="rounded-md border-2 border-danger/30 bg-danger-muted px-3 py-2 text-sm font-medium text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
