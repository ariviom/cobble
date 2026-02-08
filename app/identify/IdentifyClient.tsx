'use client';

import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IdentifyResultCard } from '@/app/components/identify/IdentifyResultCard';
import { IdentifySetList } from '@/app/components/identify/IdentifySetList';
import type {
  IdentifyCandidate,
  IdentifyPart,
  IdentifyResponse,
  IdentifySet,
} from '@/app/components/identify/types';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { Button } from '@/app/components/ui/Button';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Input } from '@/app/components/ui/Input';
import { SegmentedControl } from '@/app/components/ui/SegmentedControl';
import { ThemedPageHeader } from '@/app/components/ui/ThemedPageHeader';

type IdentifyCacheEntry = IdentifyResponse & { cachedAt: number };

const identifyResponseCache = new Map<string, IdentifyCacheEntry>();
const IDENTIFY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h local cache
const SESSION_CACHE_KEY = 'identify_cache_v1';
const SESSION_CACHE_MAX = 20;

function loadSessionCache(): Record<string, IdentifyCacheEntry> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, IdentifyCacheEntry>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function saveSessionCache(entries: Record<string, IdentifyCacheEntry>) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function getCachedIdentify(hash: string): IdentifyResponse | null {
  const now = Date.now();
  const mem = identifyResponseCache.get(hash);
  if (mem && now - mem.cachedAt <= IDENTIFY_CACHE_TTL_MS) {
    return mem as IdentifyResponse;
  }
  const session = loadSessionCache();
  const entry = session[hash];
  if (entry && now - entry.cachedAt <= IDENTIFY_CACHE_TTL_MS) {
    identifyResponseCache.set(hash, entry);
    return entry as IdentifyResponse;
  }
  return null;
}

function setCachedIdentify(hash: string, data: IdentifyResponse) {
  const entry: IdentifyCacheEntry = { ...data, cachedAt: Date.now() };
  identifyResponseCache.set(hash, entry);
  const session = loadSessionCache();
  const nextEntries = { ...session, [hash]: entry };
  // enforce max size (keep most recent)
  const hashes = Object.keys(nextEntries)
    .map(key => ({ key, ts: nextEntries[key]?.cachedAt ?? 0 }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, SESSION_CACHE_MAX);
  const trimmed: Record<string, IdentifyCacheEntry> = {};
  for (const h of hashes) {
    trimmed[h.key] = nextEntries[h.key];
  }
  saveSessionCache(trimmed);
}

type IdentifyQuota =
  | { status: 'loading' }
  | { status: 'unlimited'; tier: string }
  | {
      status: 'metered';
      tier: string;
      limit: number;
      remaining: number;
      resetAt: string;
    }
  | { status: 'unauthorized' }
  | { status: 'error'; message?: string };

type LoadingPhase = null | 'identifying' | 'finding-sets' | 'updating';

const LOADING_PHASE_LABELS: Record<NonNullable<LoadingPhase>, string> = {
  identifying: 'Identifying piece…',
  'finding-sets': 'Finding sets…',
  updating: 'Updating results…',
};

type IdentifyPageProps = {
  initialQuota?: IdentifyQuota;
  isAuthenticated: boolean;
};

function IdentifyClient({ initialQuota, isAuthenticated }: IdentifyPageProps) {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const isLoading = loadingPhase !== null;
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
  const [quota, setQuota] = useState<IdentifyQuota>(
    initialQuota ??
      (isAuthenticated ? { status: 'loading' } : { status: 'unauthorized' })
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const searchRequestIdRef = useRef(0);
  const colorChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const candidateAbortRef = useRef<AbortController | null>(null);
  const searchParams = useSearchParams();
  const hasBootstrappedFromQueryRef = useRef(false);
  const refreshQuota = useCallback(async () => {
    if (!isAuthenticated) {
      setQuota({ status: 'unauthorized' });
      return;
    }
    try {
      const res = await fetch('/api/identify/quota', { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          setQuota({ status: 'unauthorized' });
          return;
        }
        throw new Error(`quota_${res.status}`);
      }
      const data = await res.json();
      if (data.status === 'unlimited') {
        setQuota({ status: 'unlimited', tier: data.tier ?? 'plus' });
      } else if (data.status === 'metered') {
        setQuota({
          status: 'metered',
          tier: data.tier ?? 'free',
          limit: data.limit ?? 5,
          remaining: data.remaining ?? 0,
          resetAt: data.resetAt ?? null,
        });
      } else {
        setQuota({ status: 'error', message: 'unknown_response' });
      }
    } catch (err) {
      setQuota({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [isAuthenticated]);

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

      const lower = trimmed.toLowerCase();
      const looksLikeRbFig = /^fig-\w+$/i.test(trimmed);
      const alreadyPrefixed = lower.startsWith('fig:');
      const partParam = alreadyPrefixed
        ? trimmed
        : looksLikeRbFig
          ? `fig:${trimmed}`
          : trimmed;
      setError(null);
      setLoadingPhase('finding-sets');
      setHasSearched(false);
      try {
        const url = new URL('/api/identify/sets', window.location.origin);
        url.searchParams.set('part', partParam);
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
          part?: {
            partNum: string;
            name: string;
            imageUrl: string | null;
            confidence?: number;
            colorId?: number | null;
            colorName?: string | null;
            isMinifig?: boolean;
            rebrickableFigId?: string | null;
            bricklinkFigId?: string | null;
          };
          sets?: IdentifySet[];
          availableColors?: Array<{ id: number; name: string }>;
          selectedColorId?: number | null;
        };

        if (payloadAny.part) {
          setPart(prev => {
            const base: IdentifyPart = {
              partNum: payloadAny.part!.partNum,
              name: payloadAny.part!.name,
              imageUrl: payloadAny.part!.imageUrl,
              confidence: payloadAny.part!.confidence ?? prev?.confidence ?? 0,
              colorId:
                typeof payloadAny.part!.colorId !== 'undefined'
                  ? payloadAny.part!.colorId!
                  : (prev?.colorId ?? null),
              colorName:
                typeof payloadAny.part!.colorName !== 'undefined'
                  ? payloadAny.part!.colorName!
                  : (prev?.colorName ?? null),
              isMinifig: payloadAny.part!.isMinifig ?? prev?.isMinifig ?? false,
              rebrickableFigId:
                payloadAny.part!.rebrickableFigId ??
                prev?.rebrickableFigId ??
                null,
              bricklinkFigId:
                payloadAny.part!.bricklinkFigId ?? prev?.bricklinkFigId ?? null,
            };
            return base;
          });
        }

        setSets((payloadAny.sets as IdentifySet[]) ?? []);

        if (Array.isArray(payloadAny.availableColors)) {
          const opts = payloadAny.availableColors.filter(c => !!c?.name);
          setColors(opts.map(c => ({ id: c.id, name: c.name })));
        }

        if (typeof payloadAny.selectedColorId !== 'undefined') {
          setSelectedColorId(payloadAny.selectedColorId ?? null);
        }

        setBlPartId(null);
        setBlColors(null);
        setImagePreview(null);
        setSelectedFile(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingPhase(null);
        setHasSearched(true);
      }
    },
    []
  );

  const performImageSearch = useCallback(
    async (file: File, preview: string) => {
      const requestId = ++searchRequestIdRef.current;
      setError(null);
      setLoadingPhase('identifying');
      setHasSearched(false);
      try {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');

        // Stale check after async hash
        if (searchRequestIdRef.current !== requestId) return;

        // Check local cache first.
        const cached = getCachedIdentify(hashHex);
        if (cached) {
          const data = cached as IdentifyResponse;
          const fallbackImage =
            data.part?.imageUrl ??
            data.candidates?.[0]?.imageUrl ??
            preview ??
            null;
          setPart({
            ...data.part,
            imageUrl: fallbackImage,
          });
          setCandidates(data.candidates ?? []);
          setSets(data.sets ?? []);
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
          }
          setBlPartId(null);
          setBlColors(null);
          setLoadingPhase(null);
          setHasSearched(true);
          return;
        }

        const form = new FormData();
        form.append('image', file);
        const res = await fetch('/api/identify', {
          method: 'POST',
          body: form,
        });

        // Stale check after network
        if (searchRequestIdRef.current !== requestId) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? 'identify_failed');
        }
        const data = (await res.json()) as IdentifyResponse;
        const fallbackImage =
          data.part?.imageUrl ??
          data.candidates?.[0]?.imageUrl ??
          preview ??
          null;
        setPart({
          ...data.part,
          imageUrl: fallbackImage,
        });
        setCandidates(data.candidates ?? []);
        setSets(data.sets ?? []);
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
        const dataWithBL = data as IdentifyResponse & {
          blAvailableColors?: Array<{ id: number; name: string }>;
          blPartId?: string;
          source?: 'rb' | 'bl_supersets' | 'bl_components';
        };
        const blCols = dataWithBL.blAvailableColors;
        const blPid = dataWithBL.blPartId;
        if (Array.isArray(blCols) && blCols.length > 0 && blPid) {
          setBlPartId(blPid);
          setBlColors(blCols);
          setColors(
            blCols.map(c => ({
              id: c.id,
              name: c.name,
            }))
          );
          setSelectedColorId(
            typeof data.selectedColorId !== 'undefined'
              ? (data.selectedColorId ?? null)
              : null
          );
        } else {
          setBlPartId(null);
          setBlColors(null);
          if (!availableColors.length) {
            setColors([]);
          }
        }
        setCachedIdentify(hashHex, data as IdentifyResponse);
        void refreshQuota();
      } catch (e) {
        if (searchRequestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setLoadingPhase(null);
          setHasSearched(true);
        }
      }
    },
    [refreshQuota]
  );

  const onFileChange = useCallback(
    (file: File | null) => {
      if (!file) return;
      setError(null);
      setLoadingPhase(null);
      setHasSearched(false);
      setPart(null);
      setCandidates([]);
      setSets([]);
      setSelectedFile(file);
      setSelectedColorId(null);
      setBlPartId(null);
      setBlColors(null);
      setMode('camera');
      const url = URL.createObjectURL(file);
      setImagePreview(url);

      // Auto-search unless quota is exhausted
      const isExhausted =
        quota.status === 'metered' && quota.remaining === 0 && isAuthenticated;
      if (!isExhausted) {
        void performImageSearch(file, url);
      }
    },
    [quota, isAuthenticated, performImageSearch]
  );

  const onClear = useCallback(() => {
    ++searchRequestIdRef.current; // discard any in-flight image search
    setError(null);
    setLoadingPhase(null);
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
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
  }, []);

  const onPartSearch = useCallback(() => {
    const value = partSearchInput.trim();
    if (!value) return;
    void performPartLookup({ partId: value });
  }, [partSearchInput, performPartLookup]);

  const onSelectCandidate = useCallback(
    async (c: IdentifyCandidate) => {
      if (blPartId) {
        setPart(prev => ({
          partNum: c.partNum,
          name: c.name,
          imageUrl: c.imageUrl ?? prev?.imageUrl ?? null,
          confidence: c.confidence,
          colorId: c.colorId ?? prev?.colorId ?? null,
          colorName: c.colorName ?? prev?.colorName ?? null,
          isMinifig: prev?.isMinifig ?? false,
          rebrickableFigId: prev?.rebrickableFigId ?? null,
          bricklinkFigId: prev?.bricklinkFigId ?? null,
        }));
        return;
      }

      // Cancel any in-flight candidate request
      candidateAbortRef.current?.abort();
      const controller = new AbortController();
      candidateAbortRef.current = controller;

      try {
        setError(null);
        setLoadingPhase('updating');
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
        const url = new URL('/api/identify/sets', window.location.origin);
        url.searchParams.set('part', c.partNum);
        if (selectedColorId != null)
          url.searchParams.set('colorId', String(selectedColorId));
        const res = await fetch(url.toString(), {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('identify_sets_failed');
        const payload = await res.json();
        const payloadAny = payload as unknown as {
          part?: {
            partNum: string;
            name: string;
            imageUrl: string | null;
            confidence?: number;
            colorId?: number | null;
            colorName?: string | null;
            isMinifig?: boolean;
            rebrickableFigId?: string | null;
            bricklinkFigId?: string | null;
          };
          sets?: IdentifySet[];
          availableColors?: Array<{ id: number; name: string }>;
          selectedColorId?: number | null;
        };
        if (payloadAny.part) {
          setPart(prev => {
            const fallbackImage =
              payloadAny.part!.imageUrl ?? c.imageUrl ?? prev?.imageUrl ?? null;
            const base: IdentifyPart = {
              partNum: payloadAny.part!.partNum,
              name: payloadAny.part!.name,
              imageUrl: fallbackImage,
              confidence: payloadAny.part!.confidence ?? 0,
              colorId: payloadAny.part!.colorId ?? null,
              colorName: payloadAny.part!.colorName ?? null,
              isMinifig: payloadAny.part!.isMinifig ?? prev?.isMinifig ?? false,
              rebrickableFigId:
                payloadAny.part!.rebrickableFigId ??
                prev?.rebrickableFigId ??
                null,
              bricklinkFigId:
                payloadAny.part!.bricklinkFigId ?? prev?.bricklinkFigId ?? null,
            };
            return base;
          });
        }
        setSets((payloadAny.sets as IdentifySet[]) ?? []);
        if (Array.isArray(payloadAny.availableColors)) {
          const opts = payloadAny.availableColors.filter(c => !!c?.name);
          setColors(opts.map(c => ({ id: c.id, name: c.name })));
        }
        if ('selectedColorId' in payloadAny) {
          setSelectedColorId(payloadAny.selectedColorId ?? null);
        }
        setBlPartId(null);
        setBlColors(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPhase(null);
        }
      }
    },
    [selectedColorId, blPartId]
  );

  const onChangeColor = useCallback(
    (colorId: number | null) => {
      setSelectedColorId(colorId);

      // Clear any pending debounce
      if (colorChangeTimerRef.current) {
        clearTimeout(colorChangeTimerRef.current);
        colorChangeTimerRef.current = null;
      }

      const doFetch = async () => {
        if (blPartId) {
          try {
            setLoadingPhase('updating');
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
            setLoadingPhase(null);
          }
          return;
        }
        if (!part) return;
        try {
          setLoadingPhase('updating');
          const url = new URL('/api/identify/sets', window.location.origin);
          url.searchParams.set('part', part.partNum);
          if (colorId != null) url.searchParams.set('colorId', String(colorId));
          const res = await fetch(url.toString(), { cache: 'no-store' });
          if (!res.ok) throw new Error('identify_sets_failed');
          const payload: unknown = await res.json();
          const setsAny = (payload as { sets?: IdentifySet[] }).sets ?? [];
          const avail =
            (
              payload as {
                availableColors?: Array<{ id: number; name: string }>;
              }
            ).availableColors ?? undefined;
          const selected = (payload as { selectedColorId?: number | null })
            .selectedColorId;
          setSets(setsAny);
          if (Array.isArray(avail)) {
            setColors(
              avail
                .filter(c => !!c?.name)
                .map(c => ({ id: c.id, name: c.name }))
            );
          }
          if (typeof selected !== 'undefined') {
            setSelectedColorId(selected ?? null);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setLoadingPhase(null);
        }
      };

      colorChangeTimerRef.current = setTimeout(() => {
        colorChangeTimerRef.current = null;
        void doFetch();
      }, 300);
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
      const trimmedPart = partFromQuery.trim();
      const visiblePart = trimmedPart.toLowerCase().startsWith('fig:')
        ? trimmedPart.slice(4)
        : trimmedPart;
      setPartSearchInput(visiblePart);
      const colorId =
        colorIdFromQuery && colorIdFromQuery.trim() !== ''
          ? Number(colorIdFromQuery)
          : null;
      const blColorId =
        blColorIdFromQuery && blColorIdFromQuery.trim() !== ''
          ? Number(blColorIdFromQuery)
          : null;
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

  useEffect(() => {
    if (!isAuthenticated) {
      setQuota({ status: 'unauthorized' });
      return;
    }
    if (initialQuota && initialQuota.status !== 'loading') return;
    void refreshQuota();
  }, [initialQuota, isAuthenticated, refreshQuota]);

  const isQuotaExhausted =
    quota.status === 'metered' && quota.remaining === 0 && isAuthenticated;

  if (!isAuthenticated) {
    return (
      <>
        {/* Hero banner */}
        <section className="relative overflow-hidden">
          <ThemedPageHeader preferredColor="green" className="py-6 lg:py-8">
            <div className="container-default">
              <div className="text-center">
                <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-white lg:text-4xl">
                  Identify Parts & Minifigs
                </h1>
                <p className="text-base text-white/80 lg:text-lg">
                  Upload a photo or enter a part number to find sets
                </p>
              </div>
            </div>
            {/* Decorative stud pattern */}
            <div className="pointer-events-none absolute top-3 right-0 left-0 flex justify-center gap-6 opacity-10">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-3 w-3 rounded-full bg-white" />
              ))}
            </div>
          </ThemedPageHeader>
          <div className="h-1.5 bg-brand-yellow" />
        </section>

        <section className="container-default py-8">
          <div className="mx-auto w-full max-w-3xl rounded-lg border-2 border-t-4 border-subtle border-t-brand-green bg-card p-6 text-center shadow-md">
            <h2 className="mb-3 text-2xl font-bold">Sign In Required</h2>
            <p className="text-body text-foreground-muted">
              Sign in to use Identify and track your daily quota (5 per day on
              Free).
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button href="/login" variant="primary" size="lg">
                Sign in
              </Button>
            </div>
            <div className="mt-4">
              <a
                href="https://brickognize.com/"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-foreground-muted underline underline-offset-2 hover:text-foreground"
              >
                Powered by Brickognize
              </a>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {/* Hero banner with controls inside (matches Search page pattern) */}
      <section className="relative overflow-hidden">
        <ThemedPageHeader preferredColor="green" className="py-6 lg:py-8">
          <div className="container-default">
            <div className="mb-6 text-center">
              <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-white lg:text-4xl">
                Identify Parts & Minifigs
              </h1>
              <p className="text-base text-white/80 lg:text-lg">
                Upload a photo or enter a part number to find sets
              </p>
            </div>

            {/* Controls panel */}
            <div className="mx-auto w-full max-w-md">
              <SegmentedControl
                segments={[
                  { key: 'camera', label: 'Camera' },
                  { key: 'part', label: 'Part / Minifig' },
                ]}
                value={mode}
                onChange={key => setMode(key as 'camera' | 'part')}
                size="md"
                className="mb-4 w-full shadow-lg"
              />

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => onFileChange(e.target.files?.[0] ?? null)}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => onFileChange(e.target.files?.[0] ?? null)}
              />

              {mode === 'camera' ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="relative block w-full overflow-hidden rounded-lg border-2 border-dashed border-white/40 bg-white/10 backdrop-blur-sm hover:border-white/60 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Upload or take a photo"
                    disabled={isQuotaExhausted}
                  >
                    <div className="aspect-[5/2] w-full">
                      {imagePreview ? (
                        <div className="flex h-full items-center justify-center bg-black/20 p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imagePreview}
                            alt=""
                            className="max-h-full rounded object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/80">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="h-8 w-8"
                            aria-hidden="true"
                          >
                            <path d="M9 2a1 1 0 0 0-.894.553L7.382 4H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-2.382l-.724-1.447A1 1 0 0 0 14 2H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 .002 6.002A3 3 0 0 0 12 9Z" />
                          </svg>
                          <span className="text-sm font-medium">
                            Upload or take a photo
                          </span>
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      disabled={isQuotaExhausted}
                      className="text-2xs text-white/40 underline underline-offset-2 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Upload an image
                    </button>
                    {quota.status === 'metered' ? (
                      <span className="text-xs text-white/60">
                        {isQuotaExhausted
                          ? 'No IDs left today'
                          : `${quota.remaining}/${quota.limit} left today`}
                      </span>
                    ) : (
                      <span className="text-2xs text-white/40">
                        Powered by{' '}
                        <a
                          href="https://brickognize.com/"
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-white/70"
                        >
                          Brickognize
                        </a>
                      </span>
                    )}
                  </div>

                  {(selectedFile || hasSearched) && (
                    <div className="flex justify-center">
                      <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        onClick={onClear}
                        className="px-8 shadow-lg"
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <Input
                    value={partSearchInput}
                    onChange={event => setPartSearchInput(event.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onPartSearch();
                    }}
                    placeholder="e.g. 3001, cas432, fig-007"
                    size="lg"
                    className="w-full shadow-lg"
                    aria-label="Part or minifig ID"
                  />
                  <div className="flex justify-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      onClick={onPartSearch}
                      disabled={isLoading || !partSearchInput.trim()}
                      className="px-8 shadow-lg"
                    >
                      {isLoading ? 'Searching…' : 'Search'}
                    </Button>
                    {partSearchInput && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={() => setPartSearchInput('')}
                        className="shadow-lg"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Decorative stud pattern */}
          <div className="pointer-events-none absolute top-3 right-0 left-0 flex justify-center gap-6 opacity-10">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-3 w-3 rounded-full bg-white" />
            ))}
          </div>
        </ThemedPageHeader>
        <div className="h-1.5 bg-brand-yellow" />
      </section>

      {/* Results — only render when there's something to show */}
      {(part || loadingPhase || hasSearched || error) && (
        <section className="container-wide py-6 lg:py-8">
          {error && <ErrorBanner message={error} className="mb-4" />}

          {/* Single loader when no results have arrived yet */}
          {loadingPhase && !part && !hasSearched ? (
            <div className="flex items-center justify-center py-12">
              <BrickLoader label={LOADING_PHASE_LABELS[loadingPhase]} />
            </div>
          ) : (
            <>
              {part && (
                <Suspense fallback={<BrickLoader />}>
                  <IdentifyResultCard
                    part={part}
                    candidates={candidates}
                    colorOptions={colorOptions}
                    selectedColorId={selectedColorId}
                    onSelectCandidate={onSelectCandidate}
                    onChangeColor={onChangeColor}
                  />
                </Suspense>
              )}

              {hasSearched && (
                <>
                  <div className="relative -mx-3 mt-4 mb-3">
                    <div className="flex items-center gap-3 px-3">
                      <span className="text-sm font-semibold text-foreground">
                        {sets.length > 0
                          ? `Found in ${sets.length} set${sets.length !== 1 ? 's' : ''}`
                          : 'Sets'}
                      </span>
                      {loadingPhase && (
                        <BrickLoader
                          size="sm"
                          label={LOADING_PHASE_LABELS[loadingPhase]}
                        />
                      )}
                    </div>
                  </div>
                  <Suspense fallback={<BrickLoader />}>
                    <IdentifySetList
                      items={sets}
                      source={blPartId ? 'bl_supersets' : 'rb'}
                    />
                  </Suspense>
                </>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}

export default IdentifyClient;
