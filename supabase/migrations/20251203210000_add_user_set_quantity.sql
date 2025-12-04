-- Add quantity support to user_sets so we can track how many copies of a set
-- a user owns. Existing rows will default to 1 copy.

alter table if exists public.user_sets
  add column if not exists quantity integer not null default 1;

create index if not exists user_sets_quantity_idx
  on public.user_sets (quantity);





