create table if not exists public.user_collections (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_collections_pkey primary key (id)
);
create unique index if not exists user_collections_user_name_unique
  on public.user_collections (user_id, lower(name));
create table if not exists public.user_collection_sets (
  collection_id uuid not null references public.user_collections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  set_num text not null references public.rb_sets (set_num) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_collection_sets_pkey primary key (collection_id, set_num)
);
create index if not exists user_collection_sets_user_set_idx
  on public.user_collection_sets (user_id, set_num);
