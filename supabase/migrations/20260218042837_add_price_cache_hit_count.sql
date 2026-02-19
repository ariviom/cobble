ALTER TABLE public.bl_price_cache
  ADD COLUMN hit_count INTEGER NOT NULL DEFAULT 0;
