-- Add color_slot to group_session_participants for per-participant progress bar colors
alter table public.group_session_participants
  add column if not exists color_slot smallint;

-- Constrain to valid range (1-8)
alter table public.group_session_participants
  add constraint color_slot_range check (color_slot is null or (color_slot >= 1 and color_slot <= 8));
