-- Add loose_quantity to user_parts_inventory
alter table public.user_parts_inventory
  add column if not exists loose_quantity integer not null default 0;

-- Update trigger to preserve loose_quantity and not delete rows with loose parts
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
    insert into user_parts_inventory (user_id, part_num, color_id, quantity, loose_quantity, updated_at)
    values (v_user_id, v_part_num, v_color_id, v_total, 0, now())
    on conflict (user_id, part_num, color_id)
    do update set quantity = excluded.quantity, updated_at = now();
  else
    delete from user_parts_inventory
    where user_id = v_user_id
      and part_num = v_part_num
      and color_id = v_color_id
      and loose_quantity = 0;
    update user_parts_inventory
    set quantity = 0, updated_at = now()
    where user_id = v_user_id
      and part_num = v_part_num
      and color_id = v_color_id
      and loose_quantity > 0;
  end if;

  return coalesce(new, old);
end;
$$;

-- Update get_missing_parts to use quantity + loose_quantity
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
      select upi.part_num, upi.color_id, (upi.quantity + upi.loose_quantity) as quantity
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
