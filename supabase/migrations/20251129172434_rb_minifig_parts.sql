create table if not exists public.rb_minifig_parts (
  fig_num text not null references public.rb_minifigs (fig_num) on delete cascade,
  part_num text not null references public.rb_parts (part_num),
  color_id integer not null references public.rb_colors (id),
  quantity integer not null,
  constraint rb_minifig_parts_pkey primary key (fig_num, part_num, color_id)
);

create index if not exists rb_minifig_parts_fig_idx
  on public.rb_minifig_parts (fig_num);

create index if not exists rb_minifig_parts_part_color_idx
  on public.rb_minifig_parts (part_num, color_id);



