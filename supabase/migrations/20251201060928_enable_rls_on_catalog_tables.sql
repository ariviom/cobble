-- Enable RLS on BrickLink / Rebrickable minifig catalog tables that are accessed
-- exclusively via the Supabase service role client. These tables are internal
-- catalog/mapping data and should not be directly readable by anon/auth roles.

alter table public.bricklink_minifigs
  enable row level security;

alter table public.bricklink_minifig_mappings
  enable row level security;

alter table public.bl_sets
  enable row level security;

alter table public.bl_set_minifigs
  enable row level security;

alter table public.rb_minifig_parts
  enable row level security;


