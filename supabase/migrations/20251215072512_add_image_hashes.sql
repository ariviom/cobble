-- Add image hash columns for visual similarity matching
-- Using perceptual hashing (pHash) stored as text for easy comparison

-- Add to rb_minifigs for Rebrickable minifig images
ALTER TABLE rb_minifigs
ADD COLUMN IF NOT EXISTS image_hash TEXT,
ADD COLUMN IF NOT EXISTS image_hash_algorithm TEXT DEFAULT 'phash';

-- Add to rb_minifig_images for cached RB images
ALTER TABLE rb_minifig_images
ADD COLUMN IF NOT EXISTS image_hash TEXT,
ADD COLUMN IF NOT EXISTS image_hash_algorithm TEXT DEFAULT 'phash';

-- Add to bl_set_minifigs for BrickLink minifig images
ALTER TABLE bl_set_minifigs
ADD COLUMN IF NOT EXISTS image_hash TEXT,
ADD COLUMN IF NOT EXISTS image_hash_algorithm TEXT DEFAULT 'phash';

-- Add index for faster hash lookups (not unique since different images could theoretically have same hash)
CREATE INDEX IF NOT EXISTS idx_rb_minifigs_image_hash ON rb_minifigs(image_hash) WHERE image_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rb_minifig_images_image_hash ON rb_minifig_images(image_hash) WHERE image_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bl_set_minifigs_image_hash ON bl_set_minifigs(image_hash) WHERE image_hash IS NOT NULL;

-- Add image_similarity column to bricklink_minifig_mappings to store the similarity score
ALTER TABLE bricklink_minifig_mappings
ADD COLUMN IF NOT EXISTS image_similarity REAL,
ADD COLUMN IF NOT EXISTS image_match_attempted BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN rb_minifigs.image_hash IS 'Perceptual hash of the minifig image for visual similarity matching';
COMMENT ON COLUMN rb_minifigs.image_hash_algorithm IS 'Algorithm used for hashing (phash, dhash, etc)';
COMMENT ON COLUMN bricklink_minifig_mappings.image_similarity IS 'Visual similarity score between RB and BL minifig images (0-1, higher is more similar)';
COMMENT ON COLUMN bricklink_minifig_mappings.image_match_attempted IS 'Whether image matching was attempted for this mapping';

