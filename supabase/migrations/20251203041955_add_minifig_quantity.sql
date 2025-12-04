-- Add quantity support to user_minifigs so we can track how many copies a user
-- owns or wants across sets.

alter table if exists public.user_minifigs
  add column if not exists quantity integer not null default 0;

create index if not exists user_minifigs_quantity_idx
  on public.user_minifigs (quantity);


