-- Ensure catalog tables are readable but not writable by anon/authenticated clients.

-- Themes
revoke all on table public.rb_themes from public;
grant select on table public.rb_themes to anon, authenticated;

-- Colors
revoke all on table public.rb_colors from public;
grant select on table public.rb_colors to anon, authenticated;

-- Parts
revoke all on table public.rb_parts from public;
grant select on table public.rb_parts to anon, authenticated;

-- Sets
revoke all on table public.rb_sets from public;
grant select on table public.rb_sets to anon, authenticated;

-- Set parts (inventories)
revoke all on table public.rb_set_parts from public;
grant select on table public.rb_set_parts to anon, authenticated;




