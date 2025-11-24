create table if not exists public.rb_part_categories (
  id integer primary key,
  name text not null
);


create table if not exists public.rb_minifigs (
  fig_num text primary key,
  name text not null,
  num_parts integer
);


create table if not exists public.rb_inventories (
  id integer primary key,
  version integer,
  set_num text references public.rb_sets (set_num) on delete cascade
);


create table if not exists public.rb_inventory_parts (
  inventory_id integer not null references public.rb_inventories (id) on delete cascade,
  part_num text not null references public.rb_parts (part_num),
  color_id integer not null references public.rb_colors (id),
  quantity integer not null,
  is_spare boolean not null default false,
  element_id text,
  constraint rb_inventory_parts_pkey primary key (inventory_id, part_num, color_id, is_spare, element_id)
);

create index if not exists rb_inventory_parts_inventory_id_idx
  on public.rb_inventory_parts (inventory_id);

create index if not exists rb_inventory_parts_part_color_idx
  on public.rb_inventory_parts (part_num, color_id);


create table if not exists public.rb_inventory_minifigs (
  inventory_id integer not null references public.rb_inventories (id) on delete cascade,
  fig_num text not null references public.rb_minifigs (fig_num),
  quantity integer not null,
  constraint rb_inventory_minifigs_pkey primary key (inventory_id, fig_num)
);

create index if not exists rb_inventory_minifigs_inventory_id_idx
  on public.rb_inventory_minifigs (inventory_id);



