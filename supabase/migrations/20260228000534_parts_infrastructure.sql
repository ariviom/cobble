-- Parts Infrastructure: squashed migration.
-- Retains user_parts_inventory, materialized views, and utility functions
-- for future MOC coverage/missing-parts features.
-- Drops search-related objects (find_buildable_sets, find_gap_closers, feature flag).

-- =========================================================================
-- Cleanup: drop search-only objects
-- =========================================================================

-- find_buildable_sets had two overloads over its lifetime
drop function if exists public.find_buildable_sets(uuid, int, int, numeric, text, boolean, int, int);
drop function if exists public.find_buildable_sets(uuid, int, int, numeric, text);
drop function if exists public.find_gap_closers(uuid, text);
delete from public.feature_flags where key = 'can_build.enabled';

-- =========================================================================
-- 1. user_parts_inventory table
-- =========================================================================

create table if not exists public.user_parts_inventory (
  user_id uuid not null references auth.users (id) on delete cascade,
  part_num text not null references public.rb_parts (part_num),
  color_id integer not null references public.rb_colors (id),
  quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint user_parts_inventory_pkey primary key (user_id, part_num, color_id)
);

create index if not exists user_parts_inventory_user_id_idx
  on public.user_parts_inventory (user_id);
create index if not exists user_parts_inventory_part_color_idx
  on public.user_parts_inventory (part_num, color_id);
create index if not exists user_parts_inventory_color_id_idx
  on public.user_parts_inventory (color_id);

alter table public.user_parts_inventory enable row level security;

-- RLS policies (use IF NOT EXISTS via DO block)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_parts_inventory' and policyname = 'Select own parts inventory'
  ) then
    create policy "Select own parts inventory" on public.user_parts_inventory
      for select using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_parts_inventory' and policyname = 'Insert own parts inventory'
  ) then
    create policy "Insert own parts inventory" on public.user_parts_inventory
      for insert with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_parts_inventory' and policyname = 'Update own parts inventory'
  ) then
    create policy "Update own parts inventory" on public.user_parts_inventory
      for update using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_parts_inventory' and policyname = 'Delete own parts inventory'
  ) then
    create policy "Delete own parts inventory" on public.user_parts_inventory
      for delete using ((select auth.uid()) = user_id);
  end if;
end $$;

-- =========================================================================
-- 2. Trigger: sync user_parts_inventory from user_set_parts changes
-- =========================================================================

create or replace function public.sync_user_parts_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_part_num text;
  v_color_id integer;
  v_total integer;
begin
  v_user_id  := coalesce(new.user_id, old.user_id);
  v_part_num := coalesce(new.part_num, old.part_num);
  v_color_id := coalesce(new.color_id, old.color_id);

  select coalesce(sum(owned_quantity), 0) into v_total
  from user_set_parts
  where user_id = v_user_id
    and part_num = v_part_num
    and color_id = v_color_id;

  if v_total > 0 then
    insert into user_parts_inventory (user_id, part_num, color_id, quantity, updated_at)
    values (v_user_id, v_part_num, v_color_id, v_total, now())
    on conflict (user_id, part_num, color_id)
    do update set quantity = excluded.quantity, updated_at = now();
  else
    delete from user_parts_inventory
    where user_id = v_user_id
      and part_num = v_part_num
      and color_id = v_color_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_user_parts_inventory on public.user_set_parts;
create trigger trg_sync_user_parts_inventory
  after insert or update or delete on public.user_set_parts
  for each row
  execute function public.sync_user_parts_inventory();

-- =========================================================================
-- 3. Indexes on catalog tables
-- =========================================================================

create index if not exists rb_sets_num_parts_idx
  on public.rb_sets (num_parts);
create index if not exists rb_inventories_set_num_idx
  on public.rb_inventories (set_num);

-- =========================================================================
-- 4. Materialized views (with minifig parts)
-- =========================================================================

-- Must drop in dependency order to recreate
drop materialized view if exists public.mv_set_non_spare_count;
drop materialized view if exists public.mv_set_parts;

create materialized view public.mv_set_parts as
with latest_inv as (
  select distinct on (set_num) id, set_num
  from rb_inventories
  order by set_num, id desc
),
inv_parts as (
  select li.set_num, ip.part_num, ip.color_id, ip.quantity
  from latest_inv li
  join rb_inventory_parts ip on ip.inventory_id = li.id
  where ip.is_spare = false
),
minifig_parts as (
  select li.set_num, mp.part_num, mp.color_id,
         (im.quantity * mp.quantity) as quantity
  from latest_inv li
  join rb_inventory_minifigs im on im.inventory_id = li.id
  join rb_minifig_parts mp on mp.fig_num = im.fig_num
)
select set_num, part_num, color_id, sum(quantity)::int as quantity
from (
  select * from inv_parts
  union all
  select * from minifig_parts
) all_parts
group by set_num, part_num, color_id;

create index mv_set_parts_part_color_idx
  on public.mv_set_parts (part_num, color_id);
create index mv_set_parts_set_num_idx
  on public.mv_set_parts (set_num);

create materialized view public.mv_set_non_spare_count as
select set_num, count(*) as total_entries
from public.mv_set_parts
group by set_num;

create unique index mv_set_non_spare_count_pkey
  on public.mv_set_non_spare_count (set_num);

-- =========================================================================
-- 5. Utility functions (kept for future MOC support)
-- =========================================================================

-- Total pieces from owned sets (used in collection hero stats)
create or replace function public.get_user_total_pieces(
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(sp.quantity), 0)
  from user_sets us
  join mv_set_parts sp on sp.set_num = us.set_num
  where us.user_id = p_user_id
    and us.owned = true;
$$;

-- Missing parts for a target set/MOC
create or replace function public.get_missing_parts(
  p_user_id uuid,
  p_set_num text
)
returns table (
  part_num text,
  color_id int,
  part_name text,
  color_name text,
  img_url text,
  required_qty int,
  owned_qty int,
  missing_qty int
)
language sql
stable
security definer
set search_path = public
as $$
  with set_parts as (
    select sp.part_num, sp.color_id, sp.quantity
    from mv_set_parts sp
    where sp.set_num = p_set_num
  ),
  owned_set_nums as (
    select us.set_num
    from user_sets us
    where us.user_id = p_user_id and us.owned = true
  ),
  effective_parts as (
    select part_num, color_id, max(quantity) as quantity
    from (
      select sp.part_num, sp.color_id, sp.quantity
      from owned_set_nums os
      join mv_set_parts sp on sp.set_num = os.set_num
      union all
      select upi.part_num, upi.color_id, upi.quantity
      from user_parts_inventory upi
      where upi.user_id = p_user_id
    ) combined
    group by part_num, color_id
  )
  select
    sp.part_num,
    sp.color_id,
    p.name as part_name,
    c.name as color_name,
    ip.img_url,
    sp.quantity as required_qty,
    coalesce(ep.quantity, 0) as owned_qty,
    sp.quantity - coalesce(ep.quantity, 0) as missing_qty
  from set_parts sp
  left join effective_parts ep
    on ep.part_num = sp.part_num and ep.color_id = sp.color_id
  join rb_parts p on p.part_num = sp.part_num
  join rb_colors c on c.id = sp.color_id
  left join lateral (
    select ip2.img_url
    from rb_inventories inv
    join rb_inventory_parts ip2
      on ip2.inventory_id = inv.id
      and ip2.part_num = sp.part_num
      and ip2.color_id = sp.color_id
    where inv.set_num = p_set_num
    order by inv.id desc
    limit 1
  ) ip on true
  where coalesce(ep.quantity, 0) < sp.quantity
  order by (sp.quantity - coalesce(ep.quantity, 0)) desc, p.name;
$$;

-- =========================================================================
-- 6. Backfill user_parts_inventory from existing data
-- =========================================================================

insert into user_parts_inventory (user_id, part_num, color_id, quantity, updated_at)
select user_id, part_num, color_id, sum(owned_quantity), now()
from user_set_parts
where owned_quantity > 0
group by user_id, part_num, color_id
on conflict (user_id, part_num, color_id)
do update set quantity = excluded.quantity, updated_at = now();
