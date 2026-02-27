import 'server-only';

import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CanBuildFilters = {
  minParts: number;
  maxParts: number;
  minCoverage: number;
  theme: string | null;
  excludeMinifigs: boolean;
  page: number;
  limit: number;
};

export type CanBuildSet = {
  setNum: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
  coveragePct: number;
};

export type CanBuildResult = {
  sets: CanBuildSet[];
  total: number;
  totalPieces: number;
};

export type GapCloserSet = {
  setNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  coverageGainPct: number;
};

export type GapCloserResult = {
  targetSetNum: string;
  missingPartsCount: number;
  totalPartsCount: number;
  gaps: GapCloserSet[];
};

// ---------------------------------------------------------------------------
// RPC row types (snake_case as returned by Postgres)
// ---------------------------------------------------------------------------

type BuildableSetRow = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number;
  theme_id: number | null;
  theme_name: string | null;
  coverage_pct: number;
  total_count: number;
};

type GapCloserRow = {
  set_num: string;
  name: string;
  image_url: string | null;
  num_parts: number;
  coverage_gain_pct: number;
  missing_count?: number;
  total_count?: number;
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function findBuildableSets(
  userId: string,
  filters: CanBuildFilters
): Promise<CanBuildResult> {
  const supabase = getSupabaseServiceRoleClient();
  const offset = (filters.page - 1) * filters.limit;

  const { data, error } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => ReturnType<typeof supabase.rpc>
  )('find_buildable_sets', {
    p_user_id: userId,
    p_min_parts: filters.minParts,
    p_max_parts: filters.maxParts,
    p_min_coverage: filters.minCoverage,
    p_theme: filters.theme,
    p_exclude_minifigs: filters.excludeMinifigs,
    p_limit: filters.limit,
    p_offset: offset,
  });

  if (error) {
    logger.error('can_build.find_buildable_sets_failed', {
      userId,
      error: error.message,
    });
    throw new Error(error.message);
  }

  const rows = (Array.isArray(data)
    ? data
    : []) as unknown as BuildableSetRow[];
  const total = rows.length > 0 ? (rows[0]!.total_count ?? 0) : 0;

  // Get total pieces count (cosmetic — graceful degradation to 0 on failure)
  const { data: piecesData, error: piecesError } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => ReturnType<typeof supabase.rpc>
  )('get_user_total_pieces', { p_user_id: userId });

  if (piecesError) {
    logger.warn('can_build.get_total_pieces_failed', {
      userId,
      error: piecesError.message,
    });
  }

  const totalPieces = typeof piecesData === 'number' ? piecesData : 0;

  return {
    sets: rows.map(row => ({
      setNum: row.set_num,
      name: row.name,
      year: row.year,
      imageUrl: row.image_url,
      numParts: row.num_parts,
      themeId: row.theme_id,
      themeName: row.theme_name,
      coveragePct: row.coverage_pct,
    })),
    total,
    totalPieces,
  };
}

export async function findGapClosers(
  userId: string,
  targetSetNum: string
): Promise<GapCloserResult> {
  const supabase = getSupabaseServiceRoleClient();

  const { data, error } = await (
    supabase.rpc as (
      fn: string,
      args: Record<string, unknown>
    ) => ReturnType<typeof supabase.rpc>
  )('find_gap_closers', {
    p_user_id: userId,
    p_target_set_num: targetSetNum,
  });

  if (error) {
    logger.error('can_build.find_gap_closers_failed', {
      userId,
      targetSetNum,
      error: error.message,
    });
    throw new Error(error.message);
  }

  const rows = (Array.isArray(data) ? data : []) as unknown as GapCloserRow[];
  const missingCount = rows.length > 0 ? (rows[0]!.missing_count ?? 0) : 0;
  const totalCount = rows.length > 0 ? (rows[0]!.total_count ?? 0) : 0;

  return {
    targetSetNum,
    missingPartsCount: missingCount,
    totalPartsCount: totalCount,
    gaps: rows.map(row => ({
      setNum: row.set_num,
      name: row.name,
      imageUrl: row.image_url,
      numParts: row.num_parts,
      coverageGainPct: row.coverage_gain_pct,
    })),
  };
}
