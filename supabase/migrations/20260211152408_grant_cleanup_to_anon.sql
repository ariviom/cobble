-- Grant anon access to cleanup_stale_participants so anonymous joiners
-- (via getSupabaseAuthServerClient) can trigger cleanup before insert.
grant execute on function public.cleanup_stale_participants(uuid) to anon;
