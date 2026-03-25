-- Restrict group_session_participants UPDATE to only the columns that
-- heartbeat, leave, and host-kick operations need.
-- Previously the UPDATE policy was fully open (USING true, WITH CHECK true),
-- allowing any caller to modify any column on any participant row.

-- Step 1: Revoke blanket UPDATE and grant only safe columns.
-- Participants (including anonymous via anon role) need to update:
--   last_seen_at   (heartbeat)
--   pieces_found   (heartbeat)
--   left_at        (leave / host-kick)
-- They must NOT be able to change:
--   user_id, client_token, display_name, session_id, joined_at

REVOKE UPDATE ON public.group_session_participants FROM anon, authenticated;

GRANT UPDATE (last_seen_at, pieces_found, left_at)
  ON public.group_session_participants
  TO anon, authenticated;
