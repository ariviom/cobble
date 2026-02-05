-- Migration: Remove WHERE clause from user_list_items unique indexes
-- Partial indexes (with WHERE clause) cannot be used with Supabase's onConflict.
-- Non-partial indexes work because PostgreSQL treats NULLs as distinct values.

-- Drop the partial unique indexes
DROP INDEX IF EXISTS public.user_list_items_set_unique;
DROP INDEX IF EXISTS public.user_list_items_minifig_unique;

-- Create non-partial unique indexes
-- NULLs are treated as distinct, so:
-- - Set rows (set_num NOT NULL) get proper uniqueness enforcement
-- - Minifig rows (set_num IS NULL) are all distinct from each other
CREATE UNIQUE INDEX user_list_items_set_unique
  ON public.user_list_items (user_id, list_id, item_type, set_num);

CREATE UNIQUE INDEX user_list_items_minifig_unique
  ON public.user_list_items (user_id, list_id, item_type, minifig_id);
