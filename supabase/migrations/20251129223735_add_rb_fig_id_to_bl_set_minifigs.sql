alter table public.bl_set_minifigs
  add column if not exists rb_fig_id text;

create index if not exists bl_set_minifigs_rb_fig_idx
  on public.bl_set_minifigs (set_num, rb_fig_id);



