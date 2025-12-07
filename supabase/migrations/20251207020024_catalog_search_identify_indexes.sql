-- Enable trigram support for fuzzy/prefix matching on set_num and name.
create extension if not exists pg_trgm with schema public;

-- Catalog search indexes (set search).
create index if not exists idx_rb_sets_set_num_trgm on public.rb_sets using gin (set_num gin_trgm_ops);
create index if not exists idx_rb_sets_name_trgm on public.rb_sets using gin (name gin_trgm_ops);

-- Identify lookups: speed part -> sets queries (with optional color filters).
create index if not exists idx_rb_set_parts_part_num on public.rb_set_parts (part_num);
create index if not exists idx_rb_set_parts_part_color on public.rb_set_parts (part_num, color_id);



