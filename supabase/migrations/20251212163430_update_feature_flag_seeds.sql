-- Align feature flag seeds with clarified list/Search Party plan
-- - Remove obsolete lists.upload flag
-- - Refresh descriptions for lists.unlimited and search_party.* to match gating

delete from public.feature_flags where key = 'lists.upload';

insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values
  ('identify.unlimited', 'Unlimited Identify for paid plans', 'plus', 100, true),
  (
    'lists.unlimited',
    'User set collections; free capped at 3 lists, Plus/Pro unlimited',
    'plus',
    100,
    true
  ),
  (
    'search_party.unlimited',
    'Unlimited Search Party sessions (free capped via usage counters)',
    'plus',
    100,
    true
  ),
  (
    'search_party.advanced',
    'Advanced Search Party tools (bounties, scoring)',
    'plus',
    100,
    false
  ),
  ('pricing.full_cached', 'In-app cached pricing (historical averages)', 'plus', 100, true),
  ('pricing.realtime', 'Real-time pricing via BYO BrickLink key', 'pro', 100, false),
  ('sync.cloud', 'Cloud sync across devices', 'plus', 100, true),
  ('bricklink.byo_key', 'Bring your own BrickLink API key', 'pro', 100, false),
  ('mocs.custom', 'Custom MOC import/support (treated as custom user sets)', 'pro', 100, false),
  ('bulk.tools', 'Bulk ops: inventory merge, multi-set planning, list diff', 'pro', 100, false)
on conflict (key) do update
set
  description = excluded.description,
  min_tier = excluded.min_tier,
  rollout_pct = excluded.rollout_pct,
  is_enabled = excluded.is_enabled;

