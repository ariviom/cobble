'use client';

import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { useCollectionParts } from '@/app/hooks/useCollectionParts';
import { useCollectionPartsControls } from '@/app/hooks/useCollectionPartsControls';
import { useCollectionPartsSelection } from '@/app/hooks/useCollectionPartsSelection';
import { useMemo, useState } from 'react';
import { CollectionPartCard } from './CollectionPartCard';
import { CollectionPartModal } from './CollectionPartModal';
import { CollectionPartsControlBar } from './CollectionPartsControlBar';
import { MissingPartsSetGroup } from './MissingPartsSetGroup';
import { Pagination } from './Pagination';
import {
  extractCategoryOptions,
  extractColorOptions,
  filterByCriteria,
  filterBySource,
  groupParts,
  paginateParts,
  sortParts,
} from './sorting';
import type { CollectionPart, PartsSourceFilter } from './types';

import { CollectionPartsExportModal } from './CollectionPartsExportModal';

type Props = {
  syncPartsFromSets: boolean;
};

/** Invert missing data to get a map of setNumber → parts with that set missing */
function groupMissingBySet(
  parts: CollectionPart[]
): Map<string, { setName: string; parts: CollectionPart[] }> {
  const result = new Map<
    string,
    { setName: string; parts: CollectionPart[] }
  >();

  for (const part of parts) {
    for (const entry of part.missingFromSets) {
      let group = result.get(entry.setNumber);
      if (!group) {
        group = { setName: entry.setName, parts: [] };
        result.set(entry.setNumber, group);
      }
      group.parts.push(part);
    }
  }

  return result;
}

export function CollectionPartsView({ syncPartsFromSets }: Props) {
  const controls = useCollectionPartsControls();
  const {
    filter,
    sortKey,
    sortDir,
    groupBy,
    view,
    itemSize,
    page,
    pageSize,
    setFilter,
    setSortKey,
    toggleSortDir,
    setGroupBy,
    setView,
    setPage,
    setSourceFilter,
  } = controls;

  const sourceFilter = filter.source as PartsSourceFilter;

  const { parts, isLoading, reload } = useCollectionParts(
    sourceFilter,
    syncPartsFromSets
  );

  const {
    selections,
    selectionCount,
    toggleSelection,
    selectAll,
    deselectAll,
    clearAll,
    isSelected,
  } = useCollectionPartsSelection();

  // Derive category/color options from the full (unfiltered by criteria) source-filtered list
  const sourceFiltered = useMemo(
    () => filterBySource(parts, sourceFilter),
    [parts, sourceFilter]
  );

  const categoryOptions = useMemo(
    () => extractCategoryOptions(sourceFiltered),
    [sourceFiltered]
  );
  const colorOptions = useMemo(
    () => extractColorOptions(sourceFiltered),
    [sourceFiltered]
  );

  // Full pipeline: source → criteria → sort
  const processedParts = useMemo(() => {
    const criteriaFiltered = filterByCriteria(sourceFiltered, filter);
    return sortParts(criteriaFiltered, sortKey, sortDir);
  }, [sourceFiltered, filter, sortKey, sortDir]);

  // Summary counts (total unique parts + total pieces)
  const totalUnique = processedParts.length;
  const totalPieces = useMemo(
    () => processedParts.reduce((sum, p) => sum + p.totalOwned, 0),
    [processedParts]
  );

  // Missing-view: group by set (no pagination at the top level for missing)
  const missingBySet = useMemo(() => {
    if (sourceFilter !== 'missing') return null;
    return groupMissingBySet(processedParts);
  }, [sourceFilter, processedParts]);

  // Flat view: paginate
  const {
    items: pagedParts,
    totalPages,
    currentPage,
  } = useMemo(() => {
    if (sourceFilter === 'missing') {
      return { items: processedParts, totalPages: 1, currentPage: 1 };
    }

    if (groupBy !== 'none') {
      // When grouping, paginate after flattening (pagination applies to total)
      return paginateParts(processedParts, page, pageSize);
    }

    return paginateParts(processedParts, page, pageSize);
  }, [sourceFilter, processedParts, groupBy, page, pageSize]);

  // Groups for grouped view
  const groupedParts = useMemo(() => {
    if (groupBy === 'none' || sourceFilter === 'missing') return null;
    return groupParts(pagedParts, groupBy);
  }, [groupBy, sourceFilter, pagedParts]);

  const [exportOpen, setExportOpen] = useState(false);

  const partsLookup = useMemo(() => {
    const map = new Map<string, CollectionPart>();
    for (const p of parts) map.set(p.canonicalKey, p);
    return map;
  }, [parts]);

  const handleExport = () => {
    setExportOpen(true);
  };

  const [modalPart, setModalPart] = useState<CollectionPart | null>(null);
  const handleShowModal = (part: CollectionPart) => setModalPart(part);

  if (isLoading) {
    return (
      <div className="mt-8 flex justify-center">
        <BrickLoader size="sm" label="Loading parts…" />
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="mt-2 text-center text-sm text-foreground-muted">
        No parts found.{' '}
        {sourceFilter !== 'all' &&
          'Try changing the source filter to "All Parts".'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Control bar */}
      <CollectionPartsControlBar
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortDir={sortDir}
        onToggleSortDir={toggleSortDir}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        view={view}
        onViewChange={setView}
        selectionCount={selectionCount}
        onExport={handleExport}
        onClearSelections={clearAll}
        isExportDisabled={false}
        categoryOptions={categoryOptions}
        colorOptions={colorOptions}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* Summary line */}
      {processedParts.length > 0 && (
        <p className="text-center text-sm text-foreground-muted">
          {totalUnique.toLocaleString()} unique part
          {totalUnique !== 1 ? 's' : ''}
          {sourceFilter !== 'missing' && (
            <>
              {' '}
              &middot; {totalPieces.toLocaleString()} total piece
              {totalPieces !== 1 ? 's' : ''}
            </>
          )}
        </p>
      )}

      {processedParts.length === 0 && (
        <p className="mt-2 text-center text-sm text-foreground-muted">
          No parts match the current filters.
        </p>
      )}

      {/* Missing view: grouped by set */}
      {sourceFilter === 'missing' && missingBySet && (
        <div className="flex flex-col gap-4">
          {Array.from(missingBySet.entries()).map(
            ([setNumber, { setName, parts: setParts }]) => (
              <MissingPartsSetGroup
                key={setNumber}
                setNumber={setNumber}
                setName={setName}
                missingParts={setParts}
                isSelected={(key, sn) => isSelected(key, sn)}
                onToggleSelection={(key, qty, sn) =>
                  toggleSelection(key, qty, sn)
                }
                onSelectAll={selectAll}
                onDeselectAll={deselectAll}
                onShowModal={handleShowModal}
                view={view}
                itemSize={itemSize}
                isCheckboxDisabled={false}
              />
            )
          )}
        </div>
      )}

      {/* Part detail modal */}
      {modalPart && (
        <CollectionPartModal
          part={modalPart}
          onClose={() => setModalPart(null)}
          onLooseQuantityChange={reload}
        />
      )}

      {/* Export modal */}
      {exportOpen && (
        <CollectionPartsExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          selections={selections}
          partsLookup={partsLookup}
        />
      )}

      {/* Flat / grouped view */}
      {sourceFilter !== 'missing' && (
        <>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />

          {groupBy !== 'none' && groupedParts ? (
            <div className="flex flex-col gap-6">
              {Array.from(groupedParts.entries()).map(
                ([groupLabel, groupItems]) => (
                  <div key={groupLabel} className="flex flex-col gap-2">
                    <div className="px-1 py-2 text-lg font-semibold tracking-wide text-foreground uppercase">
                      {groupLabel}
                    </div>
                    <div
                      data-item-size={itemSize}
                      className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                    >
                      {groupItems.map(part => (
                        <CollectionPartCard
                          key={part.canonicalKey}
                          part={part}
                          onShowModal={handleShowModal}
                          isSelected={isSelected(part.canonicalKey)}
                          onToggleSelection={() =>
                            toggleSelection(part.canonicalKey, part.totalOwned)
                          }
                          isCheckboxDisabled={false}
                          view={view}
                          itemSize={itemSize}
                        />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div
              data-item-size={itemSize}
              className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
            >
              {pagedParts.map(part => (
                <CollectionPartCard
                  key={part.canonicalKey}
                  part={part}
                  onShowModal={handleShowModal}
                  isSelected={isSelected(part.canonicalKey)}
                  onToggleSelection={() =>
                    toggleSelection(part.canonicalKey, part.totalOwned)
                  }
                  isCheckboxDisabled={false}
                  view={view}
                  itemSize={itemSize}
                />
              ))}
            </div>
          )}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
