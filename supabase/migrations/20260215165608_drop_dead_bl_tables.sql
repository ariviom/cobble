-- Drop dead BrickLink tables that are no longer referenced by application code.
-- Part of Plan 12: Unified Data Source Audit & Dead Code Cleanup.
--
-- bl_sets: set data now comes from rb_sets
-- bricklink_minifigs: minifig metadata now from rb_minifigs (bl_minifig_id lookup)

DROP TABLE IF EXISTS public.bl_sets;
DROP TABLE IF EXISTS public.bricklink_minifigs;
