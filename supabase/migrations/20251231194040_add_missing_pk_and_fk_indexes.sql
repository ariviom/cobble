-- Migration: Add Missing Primary Key and Foreign Key Indexes
--
-- This migration addresses INFO-level performance suggestions from Supabase linter:
-- 1. Add primary key to user_list_items (no_primary_key warning)
-- 2. Add indexes for unindexed foreign keys (4 unindexed_foreign_keys warnings)
--
-- Note: We skip the 39 "unused_index" warnings as they are false positives in low-traffic
-- environments. Many of these indexes are intentional and will be used in production.

-- =============================================================================
-- PART 1: Add Primary Key to user_list_items
-- =============================================================================
-- Problem: Table lacks a primary key, which is inefficient at scale and creates
-- data integrity risks.
--
-- Solution: Add a surrogate UUID primary key column. We can't use a composite
-- natural key because the uniqueness constraint varies by item_type:
-- - For sets: (user_id, list_id, set_num) is unique
-- - For minifigs: (user_id, list_id, minifig_id) is unique
-- These are already enforced by partial unique indexes.

-- Add id column as primary key
ALTER TABLE public.user_list_items
  ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();

-- Move the id column to be first (cosmetic, but follows convention)
-- Note: This requires recreating the table in Postgres < 11, so we skip it for safety
-- The column order doesn't affect performance


-- =============================================================================
-- PART 2: Add Indexes for Unindexed Foreign Keys
-- =============================================================================
-- Foreign keys without covering indexes can cause performance issues on JOINs
-- and CASCADE operations.

-- -----------------------------------------------------------------------------
-- Table: user_list_items
-- -----------------------------------------------------------------------------
-- Index on list_id: Used when querying all items in a list
CREATE INDEX IF NOT EXISTS user_list_items_list_id_idx
  ON public.user_list_items (list_id);

-- Index on set_num: Used when querying which lists contain a specific set
-- Note: This is a partial index since set_num is only populated for item_type='set'
CREATE INDEX IF NOT EXISTS user_list_items_set_num_idx
  ON public.user_list_items (set_num)
  WHERE set_num IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Table: bricklink_minifig_mappings
-- -----------------------------------------------------------------------------
-- Index on bl_item_id (BrickLink minifig number)
-- This table is legacy/historical but still needs the FK index for integrity checks
CREATE INDEX IF NOT EXISTS bricklink_minifig_mappings_bl_item_id_idx
  ON public.bricklink_minifig_mappings (bl_item_id);

-- -----------------------------------------------------------------------------
-- Table: rb_minifig_parts
-- -----------------------------------------------------------------------------
-- Index on color_id: Used when joining with rb_colors for color lookups
CREATE INDEX IF NOT EXISTS rb_minifig_parts_color_id_idx
  ON public.rb_minifig_parts (color_id);


-- =============================================================================
-- COMMENTS: Document the additions
-- =============================================================================

COMMENT ON COLUMN public.user_list_items.id IS 
  'Surrogate primary key added for data integrity and performance. Natural uniqueness is enforced by partial unique indexes on (user_id, list_id, set_num) and (user_id, list_id, minifig_id).';

COMMENT ON INDEX user_list_items_list_id_idx IS 
  'Foreign key index for efficient list item lookups and CASCADE operations.';

COMMENT ON INDEX user_list_items_set_num_idx IS 
  'Partial foreign key index for set lookups (only where set_num IS NOT NULL).';

COMMENT ON INDEX bricklink_minifig_mappings_bl_item_id_idx IS 
  'Foreign key index for BrickLink minifig lookups (legacy table).';

COMMENT ON INDEX rb_minifig_parts_color_id_idx IS 
  'Foreign key index for color joins on minifig parts.';
