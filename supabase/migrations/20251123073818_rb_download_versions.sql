create table if not exists public.rb_download_versions (
  source text primary key,
  version text not null,
  last_ingested_at timestamptz not null default now()
);


