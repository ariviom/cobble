'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

type MinifigMapping = {
  rb_fig_id: string;
  rb_name: string | null;
  rb_img_url: string | null;
  bl_minifig_no: string;
  bl_name: string | null;
  bl_img_url: string | null;
  confidence: number | null;
  source: string | null;
  quantity: number;
};

type SetReview = {
  set_num: string;
  set_name: string;
  total_minifigs: number;
  low_confidence_count: number;
  avg_confidence: number;
  min_confidence: number;
  mappings: MinifigMapping[];
};

type ReviewResponse = {
  sets: SetReview[];
  total: number;
  total_minifigs: number;
  total_minifigs_at_threshold: number;
  total_minifigs_in_filter: number;
  params: {
    confidence_threshold: number;
    limit: number;
    offset: number;
    sort_by: string;
  };
};

type SetMinifig = {
  minifig_no: string;
  name: string | null;
  image_url: string;
  quantity: number;
  rb_fig_id: string | null;
};

export function MinifigReviewClient() {
  const queryClient = useQueryClient();
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [sortBy, setSortBy] = useState('min_confidence');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [hideApproved, setHideApproved] = useState(true);
  const [setNumFilterInput, setSetNumFilterInput] = useState(''); // Input value (immediate)
  const [setNumFilter, setSetNumFilter] = useState(''); // Debounced value (used in query)
  const [editingMapping, setEditingMapping] = useState<{
    setNum: string;
    rbFigId: string;
    oldBlNo: string;
  } | null>(null);
  const [newBlNo, setNewBlNo] = useState('');
  const [showingSelector, setShowingSelector] = useState<{
    setNum: string;
    setName: string;
    rbFigId: string;
    rbName: string | null;
    rbImgUrl: string | null;
    oldBlNo: string;
  } | null>(null);
  const [selectedBlMinifig, setSelectedBlMinifig] = useState<{
    minifig_no: string;
    name: string | null;
    image_url: string;
  } | null>(null);

  // Debounce set filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSetNumFilter(setNumFilterInput);
      setPage(0); // Reset to first page when filter changes
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [setNumFilterInput]);

  const { data, isLoading, error } = useQuery<ReviewResponse>({
    queryKey: [
      'minifig-review',
      confidenceThreshold,
      sortBy,
      page * limit,
      limit,
      hideApproved,
      setNumFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        confidence_threshold: String(confidenceThreshold),
        sort: sortBy,
        offset: String(page * limit),
        limit: String(limit),
        hide_approved: String(hideApproved),
      });
      if (setNumFilter) {
        params.set('set_num', setNumFilter);
      }
      const res = await fetch(`/api/dev/minifig-mappings/review?${params}`);
      if (!res.ok) throw new Error('Failed to fetch review data');
      return res.json();
    },
  });

  const fixMutation = useMutation({
    mutationFn: async (input: {
      set_num: string;
      rb_fig_id: string;
      old_bl_minifig_no: string;
      new_bl_minifig_no?: string;
      action: 'update' | 'delete' | 'approve';
      notes?: string;
    }) => {
      const res = await fetch('/api/dev/minifig-mappings/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fix mapping');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // If viewing a specific set, refetch to show real-time updates
      // Otherwise, update local state to prevent list reordering
      if (setNumFilter) {
        queryClient.invalidateQueries({
          queryKey: [
            'minifig-review',
            confidenceThreshold,
            sortBy,
            page * limit,
            limit,
            hideApproved,
            setNumFilter,
          ],
        });
      } else {
        // Remove the fixed mapping from local state
        queryClient.setQueryData(
          [
            'minifig-review',
            confidenceThreshold,
            sortBy,
            page * limit,
            limit,
            hideApproved,
            setNumFilter,
          ],
          (old: ReviewResponse | undefined) => {
            if (!old) return old;

            // Remove the specific mapping that was fixed
            const updatedSets = old.sets
              .map(set => {
                if (set.set_num !== variables.set_num) return set;

                const updatedMappings = set.mappings.filter(
                  m =>
                    !(
                      m.rb_fig_id === variables.rb_fig_id &&
                      m.bl_minifig_no === variables.old_bl_minifig_no
                    )
                );

                // If no mappings left in this set, filter out the entire set
                if (updatedMappings.length === 0) return null;

                return {
                  ...set,
                  mappings: updatedMappings,
                  low_confidence_count: set.low_confidence_count - 1,
                  total_minifigs: set.total_minifigs,
                };
              })
              .filter(Boolean) as SetReview[];

            return {
              ...old,
              sets: updatedSets,
              total: old.total - 1,
            };
          }
        );
      }

      setEditingMapping(null);
      setNewBlNo('');
      setShowingSelector(null);
      setSelectedBlMinifig(null);
    },
  });

  // Query to fetch all minifigs from a set for visual selection
  const { data: setMinifigsData } = useQuery<{ minifigs: SetMinifig[] }>({
    queryKey: ['set-minifigs', showingSelector?.setNum],
    queryFn: async () => {
      if (!showingSelector?.setNum) return { minifigs: [] };
      const res = await fetch(
        `/api/dev/minifig-mappings/set-minifigs?set_num=${showingSelector.setNum}`
      );
      if (!res.ok) throw new Error('Failed to fetch set minifigs');
      return res.json();
    },
    enabled: !!showingSelector,
  });

  const handleApprove = (
    setNum: string,
    rbFigId: string,
    blMinifigNo: string
  ) => {
    if (
      confirm(
        `Approve this mapping?\n\nSet: ${setNum}\nRB: ${rbFigId}\nBL: ${blMinifigNo}`
      )
    ) {
      fixMutation.mutate({
        set_num: setNum,
        rb_fig_id: rbFigId,
        old_bl_minifig_no: blMinifigNo,
        action: 'approve',
      });
    }
  };

  const handleDelete = (
    setNum: string,
    rbFigId: string,
    blMinifigNo: string
  ) => {
    if (
      confirm(
        `Delete this mapping? This cannot be undone.\n\nSet: ${setNum}\nRB: ${rbFigId}\nBL: ${blMinifigNo}`
      )
    ) {
      fixMutation.mutate({
        set_num: setNum,
        rb_fig_id: rbFigId,
        old_bl_minifig_no: blMinifigNo,
        action: 'delete',
      });
    }
  };

  const handleUpdate = () => {
    if (!editingMapping || !newBlNo) return;

    fixMutation.mutate({
      set_num: editingMapping.setNum,
      rb_fig_id: editingMapping.rbFigId,
      old_bl_minifig_no: editingMapping.oldBlNo,
      new_bl_minifig_no: newBlNo,
      action: 'update',
    });
  };

  const getConfidenceColor = (confidence: number | null) => {
    if (confidence === null) return 'text-gray-400';
    if (confidence < 0.3) return 'text-red-600 font-bold';
    if (confidence < 0.5) return 'text-orange-500 font-semibold';
    return 'text-yellow-600';
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading review data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">
          Error: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold">
          Minifig Mapping Review (Development)
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Review and fix low-confidence minifig mappings at the set level
        </p>
        {data && (
          <div className="mt-3 flex gap-6 text-sm text-gray-600 dark:text-gray-400">
            <div>
              <span className="font-semibold">Total Minifigs in DB:</span>{' '}
              {data.total_minifigs.toLocaleString()}
            </div>
            <div>
              <span className="font-semibold">
                Total Minifigs ≤ {confidenceThreshold}:
              </span>{' '}
              {data.total_minifigs_at_threshold.toLocaleString()}
            </div>
            <div>
              <span className="font-semibold">In Current Filter:</span>{' '}
              {data.total_minifigs_in_filter.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Confidence Threshold
          </label>
          <select
            value={confidenceThreshold}
            onChange={e => {
              setConfidenceThreshold(Number(e.target.value));
              setPage(0);
            }}
            className="rounded border border-gray-300 px-3 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            <option value={0.3}>{'< 0.3 (Very Low)'}</option>
            <option value={0.4}>{'< 0.4'}</option>
            <option value={0.5}>{'< 0.5 (Default)'}</option>
            <option value={0.6}>{'< 0.6'}</option>
            <option value={0.7}>{'< 0.7'}</option>
            <option value={0.8}>{'< 0.8'}</option>
            <option value={0.9}>{'< 0.9'}</option>
            <option value={1.0}>{'< 1.0 (All)'}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Sort By</label>
          <select
            value={sortBy}
            onChange={e => {
              setSortBy(e.target.value);
              setPage(0);
            }}
            className="rounded border border-gray-300 px-3 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="min_confidence">Lowest Confidence First</option>
            <option value="avg_confidence">Average Confidence</option>
            <option value="count">Most Issues First</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Per Page</label>
          <select
            value={limit}
            onChange={e => {
              setLimit(Number(e.target.value));
              setPage(0);
            }}
            className="rounded border border-gray-300 px-3 py-1 dark:border-gray-700 dark:bg-gray-800"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            <input
              type="checkbox"
              checked={hideApproved}
              onChange={e => {
                setHideApproved(e.target.checked);
                setPage(0);
              }}
              className="mr-2"
            />
            Hide Approved
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Filter by Set
          </label>
          <input
            type="text"
            placeholder="e.g., 10276-1"
            value={setNumFilterInput}
            onChange={e => {
              setSetNumFilterInput(e.target.value);
            }}
            className="rounded border px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>

        <div className="ml-auto">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {data?.sets.length ?? 0} sets
          </div>
        </div>
      </div>

      {/* Results */}
      {!data?.sets || data.sets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-900">
          <p className="text-gray-600 dark:text-gray-400">
            No sets found with low-confidence mappings below{' '}
            {confidenceThreshold}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.sets.map(set => (
            <div
              key={set.set_num}
              className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900"
            >
              {/* Set Header */}
              <div className="mb-4 border-b border-gray-200 pb-4 dark:border-gray-800">
                <h2 className="text-xl font-bold">
                  {set.set_num} — {set.set_name}
                </h2>
                <div className="mt-2 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>
                    {set.low_confidence_count} / {set.total_minifigs} low
                    confidence
                  </span>
                  <span>
                    Avg:{' '}
                    <span className={getConfidenceColor(set.avg_confidence)}>
                      {set.avg_confidence.toFixed(2)}
                    </span>
                  </span>
                  <span>
                    Min:{' '}
                    <span className={getConfidenceColor(set.min_confidence)}>
                      {set.min_confidence.toFixed(2)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Mappings */}
              <div className="space-y-4">
                {set.mappings.map(mapping => (
                  <div
                    key={`${mapping.rb_fig_id}-${mapping.bl_minifig_no}`}
                    className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="flex items-start gap-6">
                      {/* Rebrickable Minifig */}
                      <div className="flex-1">
                        <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                          REBRICKABLE
                        </div>
                        <div className="flex items-center gap-3">
                          {mapping.rb_img_url ? (
                            <img
                              src={mapping.rb_img_url}
                              alt={mapping.rb_name ?? mapping.rb_fig_id}
                              className="h-28 w-28 rounded border border-gray-300 bg-white object-contain dark:border-gray-600"
                            />
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded border border-gray-300 bg-gray-200 text-xs dark:border-gray-600 dark:bg-gray-700">
                              No image
                            </div>
                          )}
                          <div>
                            <div className="font-mono text-sm">
                              {mapping.rb_fig_id}
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {mapping.rb_name ?? 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500">
                              Qty: {mapping.quantity}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <div className="flex flex-col items-center justify-center pt-6">
                        <div className="text-2xl">↔️</div>
                        <div
                          className={`mt-1 text-xs ${getConfidenceColor(mapping.confidence)}`}
                        >
                          {mapping.confidence?.toFixed(2) ?? 'N/A'}
                        </div>
                        {mapping.source && (
                          <div className="mt-1 text-xs text-gray-500">
                            {mapping.source}
                          </div>
                        )}
                      </div>

                      {/* BrickLink Minifig */}
                      <div className="flex-1">
                        <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                          BRICKLINK
                        </div>
                        <div className="flex items-center gap-3">
                          {mapping.bl_img_url ? (
                            <img
                              src={mapping.bl_img_url}
                              alt={mapping.bl_name ?? mapping.bl_minifig_no}
                              className="h-28 w-28 rounded border border-gray-300 bg-white object-contain dark:border-gray-600"
                            />
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded border border-gray-300 bg-gray-200 text-xs dark:border-gray-600 dark:bg-gray-700">
                              No image
                            </div>
                          )}
                          <div>
                            <div className="font-mono text-sm">
                              {mapping.bl_minifig_no}
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              {mapping.bl_name ?? 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 pt-6">
                        {editingMapping?.rbFigId === mapping.rb_fig_id &&
                        editingMapping?.oldBlNo === mapping.bl_minifig_no ? (
                          <>
                            <input
                              type="text"
                              value={newBlNo}
                              onChange={e => setNewBlNo(e.target.value)}
                              placeholder="New BL ID"
                              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
                            />
                            <button
                              onClick={handleUpdate}
                              disabled={!newBlNo || fixMutation.isPending}
                              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingMapping(null);
                                setNewBlNo('');
                              }}
                              className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                handleApprove(
                                  set.set_num,
                                  mapping.rb_fig_id,
                                  mapping.bl_minifig_no
                                )
                              }
                              disabled={fixMutation.isPending}
                              className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                              title="Approve this mapping"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => {
                                setSelectedBlMinifig(null);
                                setShowingSelector({
                                  setNum: set.set_num,
                                  setName: set.set_name,
                                  rbFigId: mapping.rb_fig_id,
                                  rbName: mapping.rb_name,
                                  rbImgUrl: mapping.rb_img_url,
                                  oldBlNo: mapping.bl_minifig_no,
                                });
                              }}
                              disabled={fixMutation.isPending}
                              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                              title="Select from set minifigs"
                            >
                              🔍 Select
                            </button>
                            <button
                              onClick={() =>
                                setEditingMapping({
                                  setNum: set.set_num,
                                  rbFigId: mapping.rb_fig_id,
                                  oldBlNo: mapping.bl_minifig_no,
                                })
                              }
                              disabled={fixMutation.isPending}
                              className="rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
                              title="Type BL ID manually"
                            >
                              ✏️ Manual
                            </button>
                            <button
                              onClick={() =>
                                handleDelete(
                                  set.set_num,
                                  mapping.rb_fig_id,
                                  mapping.bl_minifig_no
                                )
                              }
                              disabled={fixMutation.isPending}
                              className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                              title="Delete mapping"
                            >
                              ✗ Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.sets.length > 0 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Previous
          </button>
          <span className="flex items-center px-4 text-sm text-gray-600 dark:text-gray-400">
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!data.sets || data.sets.length < limit}
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Next
          </button>
        </div>
      )}

      {/* Mutation Status */}
      {fixMutation.isPending && (
        <div className="fixed right-4 bottom-4 rounded-lg bg-blue-600 px-4 py-2 text-white shadow-lg">
          Processing...
        </div>
      )}
      {fixMutation.isError && (
        <div className="fixed right-4 bottom-4 rounded-lg bg-red-600 px-4 py-2 text-white shadow-lg">
          Error:{' '}
          {fixMutation.error instanceof Error
            ? fixMutation.error.message
            : 'Unknown error'}
        </div>
      )}
      {fixMutation.isSuccess && (
        <div className="fixed right-4 bottom-4 rounded-lg bg-green-600 px-4 py-2 text-white shadow-lg">
          Success!
        </div>
      )}

      {/* Visual Selector Modal */}
      {showingSelector && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-6 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                {showingSelector.setName} ({showingSelector.setNum})
              </h2>
              <button
                onClick={() => {
                  setShowingSelector(null);
                  setSelectedBlMinifig(null);
                }}
                className="rounded px-3 py-1 hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Original RB Minifig */}
            <div className="mb-6 rounded-lg border-2 border-blue-500 bg-blue-50 p-4 dark:bg-blue-900/20">
              <div className="mb-2 text-sm font-bold text-blue-700 dark:text-blue-300">
                ORIGINAL (Rebrickable)
              </div>
              <div className="flex items-center gap-4">
                {showingSelector.rbImgUrl ? (
                  <img
                    src={showingSelector.rbImgUrl}
                    alt={showingSelector.rbName ?? showingSelector.rbFigId}
                    className="h-32 w-32 rounded border border-gray-300 bg-white object-contain dark:border-gray-600"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded border border-gray-300 bg-gray-200 text-xs dark:border-gray-600 dark:bg-gray-700">
                    No image
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-mono text-lg">
                    {showingSelector.rbFigId}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300">
                    {showingSelector.rbName ?? 'Unknown'}
                  </div>
                  {selectedBlMinifig &&
                  selectedBlMinifig.minifig_no !== showingSelector.oldBlNo ? (
                    <div className="mt-2">
                      <div className="mb-2 rounded bg-blue-50 p-2 text-sm dark:bg-blue-900">
                        <div className="font-medium">Selected:</div>
                        <div className="font-mono">
                          {selectedBlMinifig.minifig_no}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {selectedBlMinifig.name}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          fixMutation.mutate({
                            set_num: showingSelector.setNum,
                            rb_fig_id: showingSelector.rbFigId,
                            old_bl_minifig_no: showingSelector.oldBlNo,
                            new_bl_minifig_no: selectedBlMinifig.minifig_no,
                            action: 'update',
                            notes: `Remapped via visual selector to ${selectedBlMinifig.minifig_no}`,
                          });
                        }}
                        disabled={fixMutation.isPending}
                        className="w-full rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        🔄 Remap to: {selectedBlMinifig.minifig_no}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        fixMutation.mutate({
                          set_num: showingSelector.setNum,
                          rb_fig_id: showingSelector.rbFigId,
                          old_bl_minifig_no: showingSelector.oldBlNo,
                          action: 'approve',
                          notes: 'Approved current mapping via visual selector',
                        });
                      }}
                      disabled={fixMutation.isPending}
                      className="mt-2 rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      ✓ Current Mapping is Correct
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4 text-sm font-medium">
              Or select a different BrickLink minifig:
            </div>

            {!setMinifigsData && (
              <div className="py-8 text-center">Loading minifigs...</div>
            )}

            {setMinifigsData && setMinifigsData.minifigs.length === 0 && (
              <div className="py-8 text-center text-gray-600">
                No minifigs found in this set
              </div>
            )}

            {setMinifigsData && setMinifigsData.minifigs.length > 0 && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {setMinifigsData.minifigs.map(minifig => (
                  <button
                    key={minifig.minifig_no}
                    onClick={() => {
                      setSelectedBlMinifig({
                        minifig_no: minifig.minifig_no,
                        name: minifig.name,
                        image_url: minifig.image_url,
                      });
                    }}
                    className={`rounded border p-3 text-left transition hover:border-blue-500 hover:shadow-lg ${
                      selectedBlMinifig?.minifig_no === minifig.minifig_no
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 dark:bg-blue-900'
                        : minifig.minifig_no === showingSelector.oldBlNo
                          ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900'
                          : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800'
                    }`}
                  >
                    <div className="mb-2 flex justify-center">
                      <img
                        src={minifig.image_url}
                        alt={minifig.name ?? minifig.minifig_no}
                        className="h-24 w-24 rounded object-contain"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove(
                            'hidden'
                          );
                        }}
                      />
                      <div className="flex hidden h-24 w-24 items-center justify-center rounded bg-gray-200 text-xs dark:bg-gray-700">
                        No image
                      </div>
                    </div>
                    <div className="font-mono text-xs text-gray-700 dark:text-gray-300">
                      {minifig.minifig_no}
                    </div>
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      {minifig.name || 'Unknown'}
                    </div>
                    {minifig.minifig_no === showingSelector.oldBlNo && (
                      <div className="mt-2 text-xs font-bold text-yellow-700 dark:text-yellow-400">
                        Current
                      </div>
                    )}
                    {minifig.rb_fig_id === showingSelector.rbFigId && (
                      <div className="mt-2 text-xs font-bold text-green-700 dark:text-green-400">
                        Mapped
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
