-- Migration: Set Ownership Overhaul
-- Changes user_sets from mutually exclusive status enum to owned boolean.
-- Wishlist becomes a system list in user_lists, allowing sets to be BOTH owned AND wishlisted.

-- Step 1: Add owned boolean column to user_sets
ALTER TABLE public.user_sets
  ADD COLUMN IF NOT EXISTS owned boolean NOT NULL DEFAULT false;

-- Step 2: Migrate existing status = 'owned' to owned = true
UPDATE public.user_sets
SET owned = true
WHERE status = 'owned';

-- Step 3: Create Wishlist system list for each user who has 'want' sets
-- Insert Wishlist for users who have 'want' status sets and don't already have a Wishlist
INSERT INTO public.user_lists (user_id, name, is_system)
SELECT DISTINCT us.user_id, 'Wishlist', true
FROM public.user_sets us
WHERE us.status = 'want'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_lists ul
    WHERE ul.user_id = us.user_id
      AND ul.name = 'Wishlist'
      AND ul.is_system = true
  );

-- Step 4: Move 'want' sets to user_list_items (Wishlist membership)
INSERT INTO public.user_list_items (user_id, list_id, item_type, set_num)
SELECT us.user_id, ul.id, 'set', us.set_num
FROM public.user_sets us
JOIN public.user_lists ul ON ul.user_id = us.user_id
  AND ul.name = 'Wishlist'
  AND ul.is_system = true
WHERE us.status = 'want'
ON CONFLICT DO NOTHING;

-- Step 5: Delete user_sets rows that were only 'want' (not owned)
-- These are now tracked in user_list_items
DELETE FROM public.user_sets
WHERE status = 'want' AND owned = false;

-- Step 6: Drop the view FIRST (it depends on the status column)
DROP VIEW IF EXISTS public.public_user_sets_view;

-- Step 7: Drop the status index (no longer needed)
DROP INDEX IF EXISTS public.user_sets_status_idx;

-- Step 8: Drop the status column from user_sets
ALTER TABLE public.user_sets
  DROP COLUMN IF EXISTS status;

-- Step 9: Recreate public_user_sets_view with owned instead of status
CREATE VIEW public.public_user_sets_view
WITH (security_invoker = true)
AS
SELECT us.user_id, us.set_num, us.owned
FROM public.user_sets us
JOIN public.user_profiles up ON up.user_id = us.user_id
WHERE coalesce(up.lists_public, false) = true;

COMMENT ON VIEW public.public_user_sets_view IS
  'Public view of user sets where lists_public=true (security_invoker=true respects RLS)';

-- Note: set_status enum is NOT dropped because user_minifigs still uses it.
-- That table can be migrated separately in a future iteration.
