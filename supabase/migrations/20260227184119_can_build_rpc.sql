-- find_buildable_sets: main "Can Build" query
-- Returns sets the user can build, filtered by piece count, coverage, and optional theme.
-- Uses window function for total_count to support pagination without separate COUNT query.
create or replace function public.find_buildable_sets(
  p_user_id uuid,
  p_min_parts int,
  p_max_parts int,
  p_min_coverage numeric,
  p_theme text default null,
  p_exclude_minifigs boolean default false,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  set_num text,
  name text,
  year int,
  image_url text,
  num_parts int,
  theme_id int,
  theme_name text,
  coverage_pct numeric,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with user_parts as (
    select part_num, color_id, quantity
    from user_parts_inventory
    where user_id = p_user_id
  ),
  candidate_sets as (
    select s.set_num, s.name, s.year, s.image_url, s.num_parts,
           s.theme_id, t.name as theme_name
    from rb_sets s
    left join rb_themes t on s.theme_id = t.id
    where s.num_parts between p_min_parts and p_max_parts
      and (p_theme is null or t.name ilike '%' || p_theme || '%')
  ),
  set_coverage as (
    select
      cs.set_num,
      count(*) as total_entries,
      count(case when coalesce(up.quantity, 0) >= ip.quantity then 1 end)
        as satisfied_entries
    from candidate_sets cs
    join rb_inventories inv on inv.set_num = cs.set_num
    join rb_inventory_parts ip on ip.inventory_id = inv.id
      and ip.is_spare = false
    left join user_parts up
      on up.part_num = ip.part_num and up.color_id = ip.color_id
    group by cs.set_num
  ),
  filtered as (
    select cs.set_num, cs.name, cs.year, cs.image_url, cs.num_parts,
           cs.theme_id, cs.theme_name,
           round(100.0 * sc.satisfied_entries
             / nullif(sc.total_entries, 0), 1) as coverage_pct
    from set_coverage sc
    join candidate_sets cs on cs.set_num = sc.set_num
    where 100.0 * sc.satisfied_entries
      / nullif(sc.total_entries, 0) >= p_min_coverage
  )
  select f.set_num, f.name, f.year, f.image_url, f.num_parts,
         f.theme_id, f.theme_name, f.coverage_pct,
         count(*) over () as total_count
  from filtered f
  order by f.coverage_pct desc, f.num_parts desc
  limit p_limit offset p_offset;
$$;

-- get_user_total_pieces: returns total aggregated piece count for hero subheader
create or replace function public.get_user_total_pieces(
  p_user_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity), 0)
  from user_parts_inventory
  where user_id = p_user_id;
$$;

-- find_gap_closers: for a target set, find catalog sets that fill the most missing parts
create or replace function public.find_gap_closers(
  p_user_id uuid,
  p_target_set_num text
)
returns table (
  set_num text,
  name text,
  image_url text,
  num_parts int,
  coverage_gain_pct numeric,
  missing_count bigint,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with target_total as (
    select count(*) as cnt
    from rb_inventories inv
    join rb_inventory_parts ip on ip.inventory_id = inv.id and ip.is_spare = false
    where inv.set_num = p_target_set_num
  ),
  target_missing as (
    select ip.part_num, ip.color_id
    from rb_inventories inv
    join rb_inventory_parts ip on ip.inventory_id = inv.id and ip.is_spare = false
    left join user_parts_inventory up
      on up.part_num = ip.part_num
      and up.color_id = ip.color_id
      and up.user_id = p_user_id
    where inv.set_num = p_target_set_num
      and coalesce(up.quantity, 0) < ip.quantity
  ),
  catalog_overlap as (
    select inv.set_num,
      count(distinct (tm.part_num, tm.color_id)) as overlap_count
    from target_missing tm
    join rb_inventory_parts ip
      on ip.part_num = tm.part_num and ip.color_id = tm.color_id
    join rb_inventories inv on inv.id = ip.inventory_id
    where inv.set_num != p_target_set_num
    group by inv.set_num
  )
  select co.set_num, s.name, s.image_url, s.num_parts,
    round(100.0 * co.overlap_count
      / nullif((select cnt from target_total), 0), 1) as coverage_gain_pct,
    (select count(*) from target_missing) as missing_count,
    (select cnt from target_total) as total_count
  from catalog_overlap co
  join rb_sets s on s.set_num = co.set_num
  order by co.overlap_count desc
  limit 3;
$$;
