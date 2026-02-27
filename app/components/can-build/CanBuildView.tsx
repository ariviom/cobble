'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import { Spinner } from '@/app/components/ui/Spinner';
import { useCanBuild, type CanBuildSet } from '@/app/hooks/useCanBuild';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CanBuildControlBar,
  type CanBuildSortField,
} from './CanBuildControlBar';
import { CanBuildDetailModal } from './CanBuildDetailModal';
import { CanBuildFilters } from './CanBuildFilters';

type SortDir = 'asc' | 'desc';

const DEFAULT_MIN_PARTS = 50;
const DEFAULT_MAX_PARTS = 500;
const DEFAULT_MIN_COVERAGE = 80;
const RESULTS_PER_PAGE = 20;

export function CanBuildView() {
  // Filter state
  const [minParts, setMinParts] = useState(DEFAULT_MIN_PARTS);
  const [maxParts, setMaxParts] = useState(DEFAULT_MAX_PARTS);
  const [minCoverage, setMinCoverage] = useState(DEFAULT_MIN_COVERAGE);
  const [excludeMinifigs, setExcludeMinifigs] = useState(false);
  const [theme, setTheme] = useState('');
  const [debouncedTheme, setDebouncedTheme] = useState('');
  const [page, setPage] = useState(1);

  // Sort state
  const [sortField, setSortField] = useState<CanBuildSortField>('coverage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Modal state
  const [selectedSet, setSelectedSet] = useState<CanBuildSet | null>(null);

  // Debounce theme input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTheme(theme), 300);
    return () => clearTimeout(timer);
  }, [theme]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [minParts, maxParts, minCoverage, excludeMinifigs, debouncedTheme]);

  const filters = useMemo(
    () => ({
      minParts,
      maxParts,
      minCoverage,
      theme: debouncedTheme || null,
      excludeMinifigs,
      page,
      limit: RESULTS_PER_PAGE,
    }),
    [minParts, maxParts, minCoverage, debouncedTheme, excludeMinifigs, page]
  );

  const { data, isLoading, isError, error } = useCanBuild(filters);

  const total = data?.total ?? 0;
  const totalPieces = data?.totalPieces ?? 0;
  const totalPages = Math.ceil(total / RESULTS_PER_PAGE);

  // Client-side sorting on the current page of results
  const sortedSets = useMemo(() => {
    const items = data?.sets ?? [];
    const sorted = [...items];
    const dir = sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortField) {
        case 'coverage':
          return (a.coveragePct - b.coveragePct) * dir;
        case 'theme':
          return (a.themeName ?? '').localeCompare(b.themeName ?? '') * dir;
        case 'year':
          return ((a.year ?? 0) - (b.year ?? 0)) * dir;
        case 'pieces':
          return (a.numParts - b.numParts) * dir;
        default:
          return 0;
      }
    });

    return sorted;
  }, [data?.sets, sortField, sortDir]);

  const handlePieceRangeChange = useCallback((range: [number, number]) => {
    setMinParts(range[0]);
    setMaxParts(range[1]);
  }, []);

  const handleOpenModal = useCallback((set: CanBuildSet) => {
    setSelectedSet(set);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedSet(null);
  }, []);

  return (
    <section className="mb-8">
      {/* Hero */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-6 pb-2 text-center">
        <h1 className="text-3xl font-bold text-foreground">Can Build</h1>
        <p className="mt-2 text-base text-foreground-muted">
          {isLoading
            ? 'Calculating your parts...'
            : `Based on your owned sets, you have ${totalPieces.toLocaleString()} pieces.`}
        </p>
      </div>

      {/* Filters */}
      <CanBuildFilters
        minParts={minParts}
        maxParts={maxParts}
        onPieceRangeChange={handlePieceRangeChange}
        minCoverage={minCoverage}
        onCoverageChange={setMinCoverage}
        excludeMinifigs={excludeMinifigs}
        onExcludeMinifigsChange={setExcludeMinifigs}
        theme={theme}
        onThemeChange={setTheme}
      />

      {/* Control bar */}
      {sortedSets.length > 0 && (
        <CanBuildControlBar
          sortField={sortField}
          onSortFieldChange={setSortField}
          sortDir={sortDir}
          onSortDirChange={setSortDir}
        />
      )}

      {/* Content */}
      <div className="mx-auto w-full max-w-7xl px-4">
        {/* Loading */}
        {isLoading && (
          <div className="mt-8 flex justify-center">
            <Spinner label="Finding buildable sets..." />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="mt-4 text-sm text-danger">
            {(error as Error)?.message === 'feature_unavailable'
              ? 'Can Build requires a Plus subscription.'
              : 'Failed to load results. Please try again.'}
          </div>
        )}

        {/* Empty: no results */}
        {!isLoading &&
          !isError &&
          sortedSets.length === 0 &&
          totalPieces > 0 && (
            <div className="mt-4 text-sm text-foreground-muted">
              No sets match your criteria. Try lowering the coverage threshold
              or expanding the piece count range.
            </div>
          )}

        {/* Empty: no parts synced */}
        {!isLoading &&
          !isError &&
          sortedSets.length === 0 &&
          totalPieces === 0 && (
            <div className="mt-4 text-sm text-foreground-muted">
              Start tracking owned parts on your sets to see what you can build.
            </div>
          )}

        {/* Results grid */}
        {sortedSets.length > 0 && (
          <div className="mt-4">
            <div
              data-item-size="md"
              className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            >
              {sortedSets.map(set => (
                <SetDisplayCard
                  key={set.setNum}
                  setNumber={set.setNum}
                  name={set.name}
                  year={set.year ?? 0}
                  imageUrl={set.imageUrl}
                  numParts={set.numParts}
                  themeLabel={set.themeName}
                  onClick={() => handleOpenModal(set)}
                >
                  <div className="px-2 pb-2 sm:px-3 sm:pb-3">
                    <div className="flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-valuenow={Math.round(set.coveragePct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${Math.round(set.coveragePct)}% coverage`}
                        className="h-2 flex-1 overflow-hidden rounded-full bg-background-muted"
                      >
                        <div
                          className="h-full rounded-full bg-theme-primary transition-[width] duration-300"
                          style={{
                            width: `${Math.round(set.coveragePct)}%`,
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-xs font-bold text-foreground-muted">
                        {Math.round(set.coveragePct)}%
                      </span>
                    </div>
                  </div>
                </SetDisplayCard>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-subtle bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-foreground-muted">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-subtle bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            {/* Result count */}
            <div className="mt-3 text-center text-xs text-foreground-muted">
              Showing {(page - 1) * RESULTS_PER_PAGE + 1}–
              {Math.min(page * RESULTS_PER_PAGE, total)} of {total} sets
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <CanBuildDetailModal
        isOpen={!!selectedSet}
        onClose={handleCloseModal}
        set={selectedSet}
      />
    </section>
  );
}
