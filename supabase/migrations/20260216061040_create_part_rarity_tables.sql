-- Part rarity: distinct set count per part+color combination
CREATE TABLE public.rb_part_rarity (
  part_num TEXT NOT NULL,
  color_id INTEGER NOT NULL,
  set_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (part_num, color_id)
);
ALTER TABLE public.rb_part_rarity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON public.rb_part_rarity FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.rb_part_rarity TO anon, authenticated;

-- Minifig rarity: min set_count across all subparts
CREATE TABLE public.rb_minifig_rarity (
  fig_num TEXT NOT NULL PRIMARY KEY,
  min_subpart_set_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.rb_minifig_rarity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read" ON public.rb_minifig_rarity FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.rb_minifig_rarity TO anon, authenticated;
