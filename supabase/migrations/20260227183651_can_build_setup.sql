-- 0. Recreate user_parts_inventory (dropped in 20260216 cleanup migration)
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

create policy "Select own parts inventory" on public.user_parts_inventory
  for select using ((select auth.uid()) = user_id);
create policy "Insert own parts inventory" on public.user_parts_inventory
  for insert with check ((select auth.uid()) = user_id);
create policy "Update own parts inventory" on public.user_parts_inventory
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Delete own parts inventory" on public.user_parts_inventory
  for delete using ((select auth.uid()) = user_id);

-- 1. Trigger function: recalculate user_parts_inventory on user_set_parts changes
-- SECURITY DEFINER is required because user_parts_inventory has RLS enabled
-- and the trigger fires in the context of the modifying session.
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
  -- part_num and color_id are immutable on user_set_parts;
  -- only owned_quantity changes. If that assumption changes,
  -- this trigger must handle OLD and NEW key tuples separately.
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

-- 2. Attach trigger to user_set_parts
drop trigger if exists trg_sync_user_parts_inventory on public.user_set_parts;
create trigger trg_sync_user_parts_inventory
  after insert or update or delete on public.user_set_parts
  for each row
  execute function public.sync_user_parts_inventory();

-- 3. Index on rb_sets(num_parts) for the piece count range filter
create index if not exists rb_sets_num_parts_idx
  on public.rb_sets (num_parts);

-- 4. Backfill user_parts_inventory from existing user_set_parts data
insert into user_parts_inventory (user_id, part_num, color_id, quantity, updated_at)
select user_id, part_num, color_id, sum(owned_quantity), now()
from user_set_parts
where owned_quantity > 0
group by user_id, part_num, color_id
on conflict (user_id, part_num, color_id)
do update set quantity = excluded.quantity, updated_at = now();

-- 5. Feature flag for Can Build
insert into public.feature_flags (key, description, min_tier, rollout_pct, is_enabled)
values ('can_build.enabled', 'Can Build: discover buildable sets from owned parts', 'plus', 100, true)
on conflict (key) do update
set description = excluded.description,
    min_tier = excluded.min_tier,
    rollout_pct = excluded.rollout_pct,
    is_enabled = excluded.is_enabled;
