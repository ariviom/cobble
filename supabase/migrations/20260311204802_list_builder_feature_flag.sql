insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values ('list_builder.enabled', 'Collection parts list builder with selection and export', 'plus', 100, true)
on conflict (key) do update
set description = excluded.description, min_tier = excluded.min_tier;
