CREATE TABLE public.bl_set_minifigs (
  set_num TEXT NOT NULL,
  minifig_no TEXT NOT NULL,
  bl_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (set_num, minifig_no)
);

ALTER TABLE public.bl_set_minifigs ENABLE ROW LEVEL SECURITY;

CREATE INDEX bl_set_minifigs_minifig_idx ON public.bl_set_minifigs (minifig_no);
