-- Migration: Fix user_list_items unique indexes
-- Changes partial unique indexes to include item_type for proper upsert support.
-- This allows the Supabase client's onConflict clause to work correctly.

-- Drop existing partial unique indexes
DROP INDEX IF EXISTS public.user_list_items_set_unique;
DROP INDEX IF EXISTS public.user_list_items_minifig_unique;

-- Create new unique indexes that include item_type
-- These support onConflict: 'user_id,list_id,item_type,set_num' for sets
-- and onConflict: 'user_id,list_id,item_type,minifig_id' for minifigs
CREATE UNIQUE INDEX user_list_items_set_unique
  ON public.user_list_items (user_id, list_id, item_type, set_num)
  WHERE set_num IS NOT NULL;

CREATE UNIQUE INDEX user_list_items_minifig_unique
  ON public.user_list_items (user_id, list_id, item_type, minifig_id)
  WHERE minifig_id IS NOT NULL;
