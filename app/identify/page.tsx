'use client';

import { IdentifyResultCard } from '@/app/components/identify/IdentifyResultCard';
import { IdentifySetList } from '@/app/components/identify/IdentifySetList';
import type {
  IdentifyCandidate,
  IdentifyPart,
  IdentifyResponse,
  IdentifySet,
} from '@/app/components/identify/types';
import { Button } from '@/app/components/ui/Button';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Input } from '@/app/components/ui/Input';
import { Spinner } from '@/app/components/ui/Spinner';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function IdentifyPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [part, setPart] = useState<IdentifyPart | null>(null);
  const [candidates, setCandidates] = useState<IdentifyCandidate[]>([]);
  const [sets, setSets] = useState<IdentifySet[]>([]);
  const [selectedColorId, setSelectedColorId] = useState<number | null>(null);
  const [colors, setColors] = useState<Array<{
    id: number;
    name: string;
  }> | null>(null);
  // BL assembly fallback color handling (no component list)
  const [blPartId, setBlPartId] = useState<string | null>(null);
  const [blColors, setBlColors] = useState<Array<{
    id: number;
    name: string;
  }> | null>(null);
  const [mode, setMode] = useState<'camera' | 'part'>('camera');
  const [partSearchInput, setPartSearchInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchParams = useSearchParams();
  const hasBootstrappedFromQueryRef = useRef(false);

  const performPartLookup = useCallback(
    async ({
      partId,
      colorId,
      blColorId,
    }: {
      partId: string;
      colorId?: number | null;
      blColorId?: number | null;
    }) => {
      const trimmed = partId.trim();
      if (!trimmed) return;
      setError(null);
      setIsLoading(true);
      setHasSearched(false);
      try {
        const url = new URL('/api/identify/sets', window.location.origin);
        url.searchParams.set('part', trimmed);
        if (typeof colorId === 'number') {
          url.searchParams.set('colorId', String(colorId));
        } else if (typeof blColorId === 'number') {
          url.searchParams.set('blColorId', String(blColorId));
        }
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('identify_sets_failed');
        }
        const payload: unknown = await res.json();
        const payloadAny = payload as {
          part?: { partNum: string; name: string; imageUrl: string | null };
          sets?: IdentifySet[];
          availableColors?: Array<{ id: number; name: string }>;
          selectedColorId?: number | null;
        };

        if (payloadAny.part) {
          setPart(prev =>
            prev
              ? {
                  ...prev,
                  partNum: payloadAny.part!.partNum,
                  name: payloadAny.part!.name,
                  imageUrl: payloadAny.part!.imageUrl,
                }
              : ({
                  partNum: payloadAny.part!.partNum,
                  name: payloadAny.part!.name,
                  imageUrl: payloadAny.part!.imageUrl,
                  confidence: 0,
                  colorId: null,
                  colorName: null,
                } satisfies IdentifyPart)
          );
        }

        setSets((payloadAny.sets as IdentifySet[]) ?? []);

        if (Array.isArray(payloadAny.availableColors)) {
          const opts = payloadAny.availableColors.filter(c => !!c?.name);
          setColors(opts.map(c => ({ id: c.id, name: c.name })));
        }

        if (typeof payloadAny.selectedColorId !== 'undefined') {
          setSelectedColorId(payloadAny.selectedColorId ?? null);
        }

        // Part-based lookup never uses BL supersets path directly.
        setBlPartId(null);
        setBlColors(null);

        // Clear any stale camera state when doing a part lookup.
        setImagePreview(null);
        setSelectedFile(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
        setHasSearched(true);
      }
    },
    []
  );

  const onFileChange = useCallback((file: File | null) => {
    if (!file) return;
    setError(null);
    setIsLoading(false);
    setHasSearched(false);
    setPart(null);
    setCandidates([]);
    setSets([]);
    setSelectedFile(file);
    setSelectedColorId(null);
    setBlPartId(null);
    setBlColors(null);
    setMode('camera');
    // preview
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const onSearch = useCallback(async () => {
    if (!selectedFile) return;
    setError(null);
    setIsLoading(true);
    setHasSearched(false);
    try {
      const form = new FormData();
      form.append('image', selectedFile);
      const res = await fetch('/api/identify', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'identify_failed');
      }
      const data = (await res.json()) as IdentifyResponse;
      setPart(data.part);
      setCandidates(data.candidates ?? []);
      setSets(data.sets ?? []);
      // Use availableColors from API; auto-select if only one
      const availableColors = (data.availableColors ?? []).filter(
        c => !!c?.name
      );
      if (availableColors.length > 0) {
        setColors(availableColors.map(c => ({ id: c.id, name: c.name })));
      } else {
        setColors([]);
      }
      if (typeof data.selectedColorId !== 'undefined') {
        setSelectedColorId(data.selectedColorId ?? null);
      } else if (availableColors.length === 1) {
        setSelectedColorId(availableColors[0]!.id);
      } else {
        setSelectedColorId(null);
      }
      // BL fallback color options
      const dataWithBL = data as IdentifyResponse & {
        blAvailableColors?: Array<{ id: number; name: string }>;
        blPartId?: string;
      };
      const blCols = dataWithBL.blAvailableColors;
      const blPid = dataWithBL.blPartId;
      if (Array.isArray(blCols) && blCols.length > 0 && blPid) {
        setBlPartId(blPid);
        setBlColors(blCols);
      } else {
        setBlPartId(null);
        setBlColors(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
      setHasSearched(true);
    }
  }, [selectedFile]);

  const onClear = useCallback(() => {
    setError(null);
    setIsLoading(false);
    setImagePreview(null);
    setSelectedFile(null);
    setHasSearched(false);
    setPart(null);
    setCandidates([]);
    setSets([]);
    setSelectedColorId(null);
    setColors(null);
    setBlPartId(null);
    setBlColors(null);
    setPartSearchInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const onPartSearch = useCallback(() => {
    const value = partSearchInput.trim();
    if (!value) return;
    void performPartLookup({ partId: value });
  }, [partSearchInput, performPartLookup]);

  const onSelectCandidate = useCallback(
    async (c: IdentifyCandidate) => {
      try {
        setError(null);
        setIsLoading(true);
        // Update displayed part immediately
        setPart(prev =>
          prev
            ? {
                ...prev,
                partNum: c.partNum,
                name: c.name,
                imageUrl: c.imageUrl ?? prev.imageUrl,
                confidence: c.confidence,
              }
            : {
                partNum: c.partNum,
                name: c.name,
                imageUrl: c.imageUrl ?? null,
                confidence: c.confidence,
                colorId: null,
                colorName: null,
              }
        );
        // Fetch sets for the candidate (respect selected color if any)
        const url = new URL('/api/identify/sets', window.location.origin);
        url.searchParams.set('part', c.partNum);
        if (selectedColorId != null)
          url.searchParams.set('colorId', String(selectedColorId));
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error('identify_sets_failed');
        const payload = await res.json();
        // payload.part has authoritative name/image; prefer it
        const payloadAny = payload as unknown as {
          part?: { partNum: string; name: string; imageUrl: string | null };
          sets?: IdentifySet[];
          availableColors?: Array<{ id: number; name: string }>;
          selectedColorId?: number | null;
        };
        if (payloadAny.part) {
          setPart(prev =>
            prev
              ? {
                  ...prev,
                  partNum: payloadAny.part!.partNum,
                  name: payloadAny.part!.name,
                  imageUrl: payloadAny.part!.imageUrl,
                }
              : (payloadAny.part as IdentifyPart)
          );
        }
        setSets((payloadAny.sets as IdentifySet[]) ?? []);
        if (Array.isArray(payloadAny.availableColors)) {
          const opts = payloadAny.availableColors.filter(c => !!c?.name);
          setColors(opts.map(c => ({ id: c.id, name: c.name })));
        }
        if ('selectedColorId' in payloadAny) {
          setSelectedColorId(payloadAny.selectedColorId ?? null);
        }
        // Clear BL fallback state on RB candidate selection
        setBlPartId(null);
        setBlColors(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [selectedColorId]
  );

  const onChangeColor = useCallback(
    async (colorId: number | null) => {
      // If in BL fallback mode, use BL color and supersets API
      if (blPartId) {
        try {
          setIsLoading(true);
          const url = new URL(
            '/api/identify/bl-supersets',
            window.location.origin
          );
          url.searchParams.set('part', blPartId);
          if (colorId != null)
            url.searchParams.set('blColorId', String(colorId));
          const res = await fetch(url.toString(), { cache: 'no-store' });
          const payload: unknown = await res.json();
          const setsAny = (payload as { sets?: IdentifySet[] }).sets ?? [];
          setSets(setsAny);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setIsLoading(false);
        }
        return;
      }
      // RB path
      setSelectedColorId(colorId);
      if (!part) return;
      try {
        setIsLoading(true);
        const url = new URL('/api/identify/sets', window.location.origin);
        url.searchParams.set('part', part.partNum);
        if (colorId != null) url.searchParams.set('colorId', String(colorId));
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error('identify_sets_failed');
        const payload: unknown = await res.json();
        const setsAny = (payload as { sets?: IdentifySet[] }).sets ?? [];
        const avail =
          (payload as { availableColors?: Array<{ id: number; name: string }> })
            .availableColors ?? undefined;
        const selected = (payload as { selectedColorId?: number | null })
          .selectedColorId;
        setSets(setsAny);
        if (Array.isArray(avail)) {
          setColors(
            avail.filter(c => !!c?.name).map(c => ({ id: c.id, name: c.name }))
          );
        }
        if (typeof selected !== 'undefined') {
          setSelectedColorId(selected ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [part, blPartId]
  );

  const colorOptions = useMemo(
    () => (blColors && blColors.length ? blColors : (colors ?? [])),
    [blColors, colors]
  );

  useEffect(() => {
    if (!searchParams) return;
    if (hasBootstrappedFromQueryRef.current) return;

    const partFromQuery = searchParams.get('part');
    const modeFromQuery = searchParams.get('mode');
    const colorIdFromQuery = searchParams.get('colorId');
    const blColorIdFromQuery = searchParams.get('blColorId');

    if (partFromQuery && partFromQuery.trim() !== '') {
      hasBootstrappedFromQueryRef.current = true;
      setMode('part');
      setPartSearchInput(partFromQuery);
      const colorId =
        colorIdFromQuery && colorIdFromQuery.trim() !== ''
          ? Number(colorIdFromQuery)
          : undefined;
      const blColorId =
        blColorIdFromQuery && blColorIdFromQuery.trim() !== ''
          ? Number(blColorIdFromQuery)
          : undefined;
      void performPartLookup({
        partId: partFromQuery,
        colorId,
        blColorId,
      });
      return;
    }

    if (modeFromQuery === 'part') {
      setMode('part');
    }

    hasBootstrappedFromQueryRef.current = true;
  }, [performPartLookup, searchParams]);

  return (
    <>
      <section className="mt-8 mb-4">
        <div className="mx-auto w-full max-w-7xl">
          <h1 className="mb-4 text-center text-4xl font-semibold">Identify</h1>
          <div className="mx-auto w-full max-w-xs">
            <div className="mb-4 flex items-center justify-center gap-2 text-xs">
              <button
                type="button"
                className={`inline-flex flex-1 items-center justify-center rounded-full border px-3 py-1 ${
                  mode === 'camera'
                    ? 'border-theme-primary bg-theme-primary/10 text-theme-primary'
                    : 'border-border-subtle bg-card text-foreground-muted hover:bg-background-muted'
                }`}
                onClick={() => setMode('camera')}
              >
                Camera
              </button>
              <button
                type="button"
                className={`inline-flex flex-1 items-center justify-center rounded-full border px-3 py-1 ${
                  mode === 'part'
                    ? 'border-theme-primary bg-theme-primary/10 text-theme-primary'
                    : 'border-border-subtle bg-card text-foreground-muted hover:bg-background-muted'
                }`}
                onClick={() => setMode('part')}
              >
                Part / minifig
              </button>
            </div>

            {mode === 'camera' ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => onFileChange(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative block w-full max-w-xs overflow-hidden rounded-md border-2 border-dashed border-border-subtle bg-card-muted hover:bg-background-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Upload or take a photo"
                >
                  <div className="aspect-square w-full">
                    {imagePreview ? (
                      <div className="h-full w-full overflow-hidden rounded bg-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagePreview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-foreground-muted">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="h-12 w-12"
                          aria-hidden="true"
                        >
                          <path d="M9 2a1 1 0 0 0-.894.553L7.382 4H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-2.382l-.724-1.447A1 1 0 0 0 14 2H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 .002 6.002A3 3 0 0 0 12 9Z" />
                        </svg>
                        <div className="text-sm font-medium">
                          Upload or take a photo
                        </div>
                        <div className="text-xs text-foreground-muted">
                          Supports camera on mobile
                        </div>
                      </div>
                    )}
                  </div>
                </button>
                {selectedFile && !hasSearched && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={onSearch}
                      disabled={isLoading}
                      className="min-w-32"
                    >
                      {isLoading ? 'Searching…' : 'Search'}
                    </Button>
                  </div>
                )}
                {selectedFile && hasSearched && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={onClear}
                      className="min-w-32"
                    >
                      Clear search
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Part or minifig ID
                </label>
                <Input
                  value={partSearchInput}
                  onChange={event => setPartSearchInput(event.target.value)}
                  placeholder="e.g. 3001, 2336pr0003, fig-007"
                  size="md"
                  className="w-full"
                />
                <div className="mt-3 flex justify-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={onPartSearch}
                    disabled={isLoading || !partSearchInput.trim()}
                    className="min-w-32"
                  >
                    {isLoading ? 'Searching…' : 'Search'}
                  </Button>
                  {hasSearched && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onClear}
                      className="min-w-24"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          {isLoading && (
            <Spinner className="mt-4" label="Processing image…" />
          )}
          {error && (
            <div className="mt-4">
              <ErrorBanner message={`Failed to identify image: ${error}`} />
            </div>
          )}
        </div>
      </section>
      {part && (
        <section className="mb-8">
          <div className="mx-auto w-full max-w-7xl">
            <IdentifyResultCard
              part={part}
              candidates={candidates}
              onSelectCandidate={onSelectCandidate}
              colorOptions={colorOptions}
              selectedColorId={selectedColorId}
              onChangeColor={onChangeColor}
            />
            <IdentifySetList items={sets} />
          </div>
        </section>
      )}
    </>
  );
}
