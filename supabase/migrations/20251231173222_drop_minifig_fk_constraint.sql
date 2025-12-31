-- Drop FK constraints that prevent storing BrickLink IDs in user_minifigs
-- This migration enables the app to use BrickLink minifig IDs as the exclusive source of truth

-- Drop FK constraint from user_minifigs to rb_minifigs
ALTER TABLE user_minifigs DROP CONSTRAINT IF EXISTS user_minifigs_fig_num_fkey;

-- Drop FK constraint from user_list_items to rb_minifigs
ALTER TABLE user_list_items DROP CONSTRAINT IF EXISTS user_list_items_minifig_id_fkey;

-- Document the change
COMMENT ON COLUMN user_minifigs.fig_num IS 'BrickLink minifig ID (e.g., sw0001, cty1234). FK to rb_minifigs removed to allow BL IDs as the exclusive source of truth.';
COMMENT ON COLUMN user_list_items.minifig_id IS 'BrickLink minifig ID (e.g., sw0001, cty1234). FK to rb_minifigs removed to allow BL IDs.';

-- Ensure indexes exist for efficient BL queries
CREATE INDEX IF NOT EXISTS idx_bricklink_minifigs_item_id ON bricklink_minifigs(item_id);
CREATE INDEX IF NOT EXISTS idx_bl_set_minifigs_minifig_no ON bl_set_minifigs(minifig_no);
CREATE INDEX IF NOT EXISTS idx_bl_minifig_parts_minifig_no ON bl_minifig_parts(bl_minifig_no);
