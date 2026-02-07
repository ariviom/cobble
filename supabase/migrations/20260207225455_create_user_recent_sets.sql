CREATE TABLE public.user_recent_sets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_num text NOT NULL,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_num)
);

CREATE INDEX user_recent_sets_user_viewed_idx
  ON public.user_recent_sets (user_id, last_viewed_at DESC);

ALTER TABLE public.user_recent_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Select own" ON public.user_recent_sets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Insert own" ON public.user_recent_sets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own" ON public.user_recent_sets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Delete own" ON public.user_recent_sets FOR DELETE USING (auth.uid() = user_id);
