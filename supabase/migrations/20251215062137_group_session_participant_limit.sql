-- Migration: Add participant limit enforcement to group sessions
-- This migration:
-- 1. Drops the overly permissive insert policy
-- 2. Creates a function to check participant count
-- 3. Creates a restrictive insert policy with limit check
-- 4. Adds cleanup function for stale participants

-- Drop the existing overly permissive policy
drop policy if exists "Public insert group session participants"
  on public.group_session_participants;

-- Create function to check participant limit (8 max active participants)
create or replace function public.check_participant_limit(session_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
begin
  select count(*) into active_count
  from group_session_participants
  where session_id = session_uuid
    and left_at is null;
  
  -- Allow insert only if fewer than 8 active participants
  return active_count < 8;
end;
$$;

-- Create restrictive insert policy with participant limit
create policy "Public insert group session participants (limited)"
  on public.group_session_participants
  for insert
  with check (public.check_participant_limit(session_id));

-- Create function to clean up stale participants (not seen in 30 minutes)
create or replace function public.cleanup_stale_participants(session_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_count integer;
begin
  update group_session_participants
  set left_at = now()
  where session_id = session_uuid
    and left_at is null
    and last_seen_at < now() - interval '30 minutes';
  
  get diagnostics cleaned_count = row_count;
  return cleaned_count;
end;
$$;

-- Grant execute permissions
grant execute on function public.check_participant_limit(uuid) to anon, authenticated;
grant execute on function public.cleanup_stale_participants(uuid) to authenticated;

-- Add helpful comments
comment on function public.check_participant_limit(uuid) is 
  'Returns true if session has fewer than 8 active participants, allowing new joins';
comment on function public.cleanup_stale_participants(uuid) is 
  'Marks participants as left if they have not been seen in 30 minutes. Returns count of cleaned participants';

