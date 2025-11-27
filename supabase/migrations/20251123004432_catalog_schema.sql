create table if not exists public.rb_themes (
  id integer primary key,
  name text not null,
  parent_id integer references public.rb_themes(id) on delete set null
);
create index if not exists rb_themes_parent_id_idx
  on public.rb_themes (parent_id);
create table if not exists public.rb_colors (
  id integer primary key,
  name text not null,
  rgb char(6),
  is_trans boolean not null default false,
  external_ids jsonb,
  last_updated_at timestamptz not null default now()
);
create index if not exists rb_colors_name_idx
  on public.rb_colors (name);
create table if not exists public.rb_parts (
  part_num text primary key,
  name text not null,
  part_cat_id integer,
  image_url text,
  external_ids jsonb,
  last_updated_at timestamptz not null default now()
);
create index if not exists rb_parts_name_idx
  on public.rb_parts (name);
create index if not exists rb_parts_part_cat_id_idx
  on public.rb_parts (part_cat_id);
create table if not exists public.rb_sets (
  set_num text primary key,
  name text not null,
  year integer,
  theme_id integer references public.rb_themes(id),
  num_parts integer,
  image_url text,
  last_updated_at timestamptz not null default now()
);
create index if not exists rb_sets_theme_id_idx
  on public.rb_sets (theme_id);
create index if not exists rb_sets_year_idx
  on public.rb_sets (year);
create table if not exists public.rb_set_parts (
  set_num text not null,
  part_num text not null,
  color_id integer not null,
  quantity integer not null,
  is_spare boolean not null default false,
  last_updated_at timestamptz not null default now(),
  constraint rb_set_parts_pkey primary key (set_num, part_num, color_id, is_spare),
  constraint rb_set_parts_set_fk foreign key (set_num)
    references public.rb_sets (set_num)
    on delete cascade,
  constraint rb_set_parts_part_fk foreign key (part_num)
    references public.rb_parts (part_num)
    on delete restrict,
  constraint rb_set_parts_color_fk foreign key (color_id)
    references public.rb_colors (id)
    on delete restrict
);
create index if not exists rb_set_parts_set_num_idx
  on public.rb_set_parts (set_num);
create index if not exists rb_set_parts_part_num_idx
  on public.rb_set_parts (part_num);
create index if not exists rb_set_parts_color_id_idx
  on public.rb_set_parts (color_id);
