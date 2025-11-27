-- Add covering indexes for foreign keys flagged by Supabase advisors.

create index if not exists group_session_participants_user_id_idx
  on public.group_session_participants (user_id);

create index if not exists group_sessions_set_num_idx
  on public.group_sessions (set_num);

create index if not exists user_sets_set_num_idx
  on public.user_sets (set_num);

create index if not exists user_collection_sets_set_num_idx
  on public.user_collection_sets (set_num);

create index if not exists user_set_parts_set_num_idx
  on public.user_set_parts (set_num);

create index if not exists user_set_parts_color_id_idx
  on public.user_set_parts (color_id);

create index if not exists user_parts_inventory_color_id_idx
  on public.user_parts_inventory (color_id);

create index if not exists rb_inventory_parts_color_id_idx
  on public.rb_inventory_parts (color_id);

create index if not exists rb_inventory_minifigs_fig_num_idx
  on public.rb_inventory_minifigs (fig_num);

