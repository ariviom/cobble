-- Migration: Drop Rebrickable minifig mapping data
--
-- Removes unreliable RB↔BL minifig mapping data. BrickLink is now the
-- exclusive source of truth for minifig IDs. The heuristic-based mappings
-- (position matching, quantity matching) were not deterministic and should
-- not be relied upon.

-- Drop the rb_fig_id column from bl_set_minifigs
-- This column stored per-set RB→BL mappings that were heuristically guessed
ALTER TABLE bl_set_minifigs DROP COLUMN IF EXISTS rb_fig_id;

-- Drop the bricklink_minifig_mappings table entirely
-- This table stored global RB→BL mappings that were unreliable
DROP TABLE IF EXISTS bricklink_minifig_mappings;
