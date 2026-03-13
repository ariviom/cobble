-- Add monotonic sync_version to user_set_parts for delta sync.
-- Each write gets a new version from a global sequence, enabling
-- efficient "give me everything changed since version N" queries.

-- 1. Sequence
CREATE SEQUENCE public.user_set_parts_sync_seq;

-- 2. Column
ALTER TABLE public.user_set_parts
  ADD COLUMN sync_version bigint NOT NULL DEFAULT 0;

-- 3. Trigger function: bumps sync_version and updated_at on every write
CREATE OR REPLACE FUNCTION public.bump_user_set_parts_sync_version()
RETURNS trigger AS $$
BEGIN
  NEW.sync_version := nextval('public.user_set_parts_sync_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_sync_version
  BEFORE INSERT OR UPDATE ON public.user_set_parts
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_user_set_parts_sync_version();

-- 4. RPC: get max sync_version per set for a user (called after push)
CREATE OR REPLACE FUNCTION public.get_max_sync_versions(
  p_user_id uuid,
  p_set_nums text[]
) RETURNS TABLE(set_num text, max_version bigint) AS $$
  SELECT usp.set_num, MAX(usp.sync_version)
  FROM public.user_set_parts usp
  WHERE usp.user_id = p_user_id AND usp.set_num = ANY(p_set_nums)
  GROUP BY usp.set_num;
$$ LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_max_sync_versions(uuid, text[]) TO authenticated;

-- 5. Index for delta pull: WHERE user_id = ? AND set_num = ? AND sync_version > ?
CREATE INDEX user_set_parts_sync_version_idx
  ON public.user_set_parts (user_id, set_num, sync_version);

-- 6. Backfill existing rows so first delta pull finds them
UPDATE public.user_set_parts
SET sync_version = nextval('public.user_set_parts_sync_seq')
WHERE sync_version = 0;
