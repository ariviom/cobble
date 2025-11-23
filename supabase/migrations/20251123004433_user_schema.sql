create type public.set_status as enum ('owned', 'want', 'can_build', 'partial');


create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  subscription_tier text,
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text,
  default_filter jsonb,
  settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.user_sets (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_num text not null references public.rb_sets (set_num) on delete cascade,
  status public.set_status not null,
  has_instructions boolean not null default false,
  has_box boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_sets_pkey primary key (user_id, set_num)
);

create index if not exists user_sets_user_id_idx
  on public.user_sets (user_id);

create index if not exists user_sets_status_idx
  on public.user_sets (status);


create table if not exists public.user_set_parts (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_num text not null references public.rb_sets (set_num) on delete cascade,
  part_num text not null references public.rb_parts (part_num),
  color_id integer not null references public.rb_colors (id),
  is_spare boolean not null default false,
  owned_quantity integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint user_set_parts_pkey primary key (user_id, set_num, part_num, color_id, is_spare),
  constraint user_set_parts_inventory_fk foreign key (set_num, part_num, color_id, is_spare)
    references public.rb_set_parts (set_num, part_num, color_id, is_spare)
    on delete cascade
);

create index if not exists user_set_parts_user_set_idx
  on public.user_set_parts (user_id, set_num);

create index if not exists user_set_parts_part_color_idx
  on public.user_set_parts (part_num, color_id);


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



