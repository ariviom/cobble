ALTER TABLE public.user_sets
  ADD COLUMN found_count integer NOT NULL DEFAULT 0;

-- Backfill from existing user_set_parts data
UPDATE public.user_sets us
SET found_count = COALESCE(sub.total, 0)
FROM (
  SELECT user_id, set_num, SUM(owned_quantity) AS total
  FROM public.user_set_parts
  WHERE is_spare = false AND owned_quantity > 0
  GROUP BY user_id, set_num
) sub
WHERE us.user_id = sub.user_id AND us.set_num = sub.set_num;
