-- M3: Add is_active check to check_participant_limit function.
-- Prevents counting participants from ended sessions.
-- Belt-and-suspenders: RLS already filters by is_active.

create or replace function public.check_participant_limit(session_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  session_active boolean;
begin
  -- Verify the session itself is still active
  select is_active into session_active
  from group_sessions
  where id = session_uuid;

  if session_active is not true then
    return false;
  end if;

  select count(*) into active_count
  from group_session_participants
  where session_id = session_uuid
    and left_at is null;

  -- Allow insert only if fewer than 8 active participants
  return active_count < 8;
end;
$$;
