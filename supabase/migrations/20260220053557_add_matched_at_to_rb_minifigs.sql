-- Add matched_at to track when a BL minifig mapping was established.
-- Backfill all rows that already have a mapping with now().
ALTER TABLE public.rb_minifigs
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

UPDATE public.rb_minifigs
  SET matched_at = now()
  WHERE bl_minifig_id IS NOT NULL;
