-- Remove legacy image hash columns used for minifig visual similarity matching.
-- Image hashing was part of the RB→BL minifig mapping algorithm but is no longer
-- needed now that BrickLink is the source of truth. Name-based matching handles
-- the vast majority of cases.

-- Drop image hash columns from bl_set_minifigs
ALTER TABLE bl_set_minifigs
  DROP COLUMN IF EXISTS image_hash,
  DROP COLUMN IF EXISTS image_hash_algorithm;

-- Drop image hash columns from rb_minifig_images
ALTER TABLE rb_minifig_images
  DROP COLUMN IF EXISTS image_hash,
  DROP COLUMN IF EXISTS image_hash_algorithm;

-- Drop image hash columns from rb_minifigs
ALTER TABLE rb_minifigs
  DROP COLUMN IF EXISTS image_hash,
  DROP COLUMN IF EXISTS image_hash_algorithm;

-- Drop image similarity columns from bricklink_minifig_mappings
ALTER TABLE bricklink_minifig_mappings
  DROP COLUMN IF EXISTS image_similarity,
  DROP COLUMN IF EXISTS image_match_attempted;

-- Drop indexes on image_hash columns (these were created in 20251215072512_add_image_hashes.sql)
DROP INDEX IF EXISTS idx_bl_set_minifigs_image_hash;
DROP INDEX IF EXISTS idx_rb_minifig_images_image_hash;
DROP INDEX IF EXISTS idx_rb_minifigs_image_hash;
