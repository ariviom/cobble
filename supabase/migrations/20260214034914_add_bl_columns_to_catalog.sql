-- Add direct BrickLink ID columns to catalog tables for straightforward
-- RB↔BL lookups without JSON parsing or separate mapping tables.

-- rb_parts: denormalized BL part ID (was buried in external_ids JSON)
ALTER TABLE rb_parts ADD COLUMN IF NOT EXISTS bl_part_id TEXT;
CREATE INDEX IF NOT EXISTS idx_rb_parts_bl_part_id ON rb_parts(bl_part_id)
  WHERE bl_part_id IS NOT NULL;

-- rb_minifigs: BL minifig ID mapping from bricklinkable pipeline (98% coverage)
ALTER TABLE rb_minifigs ADD COLUMN IF NOT EXISTS bl_minifig_id TEXT;
ALTER TABLE rb_minifigs ADD COLUMN IF NOT EXISTS bl_mapping_confidence REAL;
ALTER TABLE rb_minifigs ADD COLUMN IF NOT EXISTS bl_mapping_source TEXT;
CREATE INDEX IF NOT EXISTS idx_rb_minifigs_bl_minifig_id ON rb_minifigs(bl_minifig_id)
  WHERE bl_minifig_id IS NOT NULL;
