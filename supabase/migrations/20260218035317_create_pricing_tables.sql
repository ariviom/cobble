-- Raw BL API responses (6hr TTL)
CREATE TABLE public.bl_price_cache (
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  color_id INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '',
  avg_price NUMERIC(10,4),
  min_price NUMERIC(10,4),
  max_price NUMERIC(10,4),
  qty_avg_price NUMERIC(10,4),
  unit_quantity INTEGER,
  total_quantity INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, item_type, color_id, condition, currency_code, country_code)
);
ALTER TABLE public.bl_price_cache ENABLE ROW LEVEL SECURITY;

-- Observation log (180d retention, seeds derived pricing)
CREATE TABLE public.bl_price_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  color_id INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '',
  avg_price NUMERIC(10,4),
  min_price NUMERIC(10,4),
  max_price NUMERIC(10,4),
  qty_avg_price NUMERIC(10,4),
  unit_quantity INTEGER,
  total_quantity INTEGER,
  source TEXT NOT NULL DEFAULT 'api',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_obs_lookup
  ON bl_price_observations (item_id, item_type, color_id, condition, currency_code, country_code, observed_at);
ALTER TABLE public.bl_price_observations ENABLE ROW LEVEL SECURITY;

-- Brick Party derived averages (90d TTL)
CREATE TABLE public.bp_derived_prices (
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  color_id INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '',
  derived_avg NUMERIC(10,4) NOT NULL,
  derived_min NUMERIC(10,4),
  derived_max NUMERIC(10,4),
  observation_count INTEGER NOT NULL,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, item_type, color_id, condition, currency_code, country_code)
);
ALTER TABLE public.bp_derived_prices ENABLE ROW LEVEL SECURITY;
