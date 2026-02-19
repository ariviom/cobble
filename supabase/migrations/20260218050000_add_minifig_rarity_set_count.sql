-- Add set_count to rb_minifig_rarity: the actual number of sets containing the minifig.
-- Distinct from min_subpart_set_count which tracks the rarest subpart.

ALTER TABLE public.rb_minifig_rarity
  ADD COLUMN IF NOT EXISTS set_count INTEGER NOT NULL DEFAULT 0;
