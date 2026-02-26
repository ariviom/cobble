-- Add feature flag seeds for tab limits and rarity badges
insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values
  ('tabs.unlimited', 'Unlimited open tabs (free capped at 3)', 'plus', 100, true),
  ('rarity.enabled', 'Part rarity badges and filters', 'plus', 100, true)
on conflict (key) do update
set
  description = excluded.description,
  min_tier = excluded.min_tier,
  rollout_pct = excluded.rollout_pct,
  is_enabled = excluded.is_enabled;
