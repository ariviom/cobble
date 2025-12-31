-- Migration: Bricklink Minifig as Primary Source of Truth
-- 
-- This migration adds indexes and ensures schema readiness for using Bricklink
-- as the exclusive source of truth for minifigure data.

-- Ensure bl_minifig_parts table exists (may have been created manually)
-- Primary key is (bl_minifig_no, bl_part_id, bl_color_id) for component parts
CREATE TABLE IF NOT EXISTS public.bl_minifig_parts (
  bl_minifig_no TEXT NOT NULL,
  bl_part_id TEXT NOT NULL,
  bl_color_id INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  last_refreshed_at TIMESTAMPTZ,
  PRIMARY KEY (bl_minifig_no, bl_part_id, bl_color_id)
);

-- Enable RLS on bl_minifig_parts (internal catalog table)
ALTER TABLE public.bl_minifig_parts ENABLE ROW LEVEL SECURITY;

-- Add index on bl_minifig_no for fast lookups of all parts for a minifig
CREATE INDEX IF NOT EXISTS bl_minifig_parts_minifig_idx
  ON public.bl_minifig_parts (bl_minifig_no);

-- Add reverse lookup index on bl_set_minifigs.rb_fig_id for RB→BL mapping
-- (may already exist from 20251129223735, but CREATE INDEX IF NOT EXISTS is safe)
CREATE INDEX IF NOT EXISTS bl_set_minifigs_rb_fig_only_idx
  ON public.bl_set_minifigs (rb_fig_id)
  WHERE rb_fig_id IS NOT NULL;

-- Add minifig_no-only index for fast lookups across all sets
CREATE INDEX IF NOT EXISTS bl_set_minifigs_minifig_idx
  ON public.bl_set_minifigs (minifig_no);

-- Add parts_sync_status column to bricklink_minifigs if not exists
-- This tracks whether component parts have been synced from BL API
ALTER TABLE public.bricklink_minifigs
  ADD COLUMN IF NOT EXISTS parts_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS last_parts_sync_at TIMESTAMPTZ;

-- Add index for finding minifigs that need parts sync
CREATE INDEX IF NOT EXISTS bricklink_minifigs_parts_sync_idx
  ON public.bricklink_minifigs (parts_sync_status)
  WHERE parts_sync_status IS NULL OR parts_sync_status != 'ok';

-- COMMENT on migration purpose
COMMENT ON INDEX bl_minifig_parts_minifig_idx IS 
  'Fast lookup of all component parts for a BL minifig';
COMMENT ON INDEX bl_set_minifigs_rb_fig_only_idx IS 
  'Reverse lookup from RB fig_num to BL minifig_no';
COMMENT ON INDEX bl_set_minifigs_minifig_idx IS 
  'Fast lookup of which sets contain a specific BL minifig';
