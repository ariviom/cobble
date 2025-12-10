-- Enable RLS on BrickLink part cache tables to keep them service-role only.
alter table if exists public.bl_parts enable row level security;
alter table if exists public.bl_part_sets enable row level security;

-- No anon/auth policies are created; access is via service role only.

