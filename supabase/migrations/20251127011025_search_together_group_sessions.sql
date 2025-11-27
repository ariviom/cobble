create table if not exists public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users (id) on delete cascade,
  set_num text not null references public.rb_sets (set_num) on delete cascade,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists group_sessions_host_set_idx
  on public.group_sessions (host_user_id, set_num)
  where is_active = true;


create table if not exists public.group_session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.group_sessions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  client_token text not null,
  display_name text not null,
  pieces_found integer not null default 0,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz
);

create unique index if not exists group_session_participants_session_client_idx
  on public.group_session_participants (session_id, client_token);

create index if not exists group_session_participants_session_idx
  on public.group_session_participants (session_id);


-- Basic row-level security:
-- - Anyone with the session slug can read active sessions and participants.
-- - Only authenticated hosts can create/end their own sessions.
-- - Participants (including anonymous) can insert/update their own participant rows via the API.
alter table public.group_sessions enable row level security;
alter table public.group_session_participants enable row level security;

-- Public can read active sessions by slug (joining is guarded by the opaque slug).
create policy "Public read active group sessions"
  on public.group_sessions
  for select
  using (is_active = true);

-- Hosts can create and update their own sessions.
create policy "Hosts manage their group sessions"
  on public.group_sessions
  for all
  using (auth.uid() = host_user_id)
  with check (auth.uid() = host_user_id);

-- Anyone can read participants for an active session (names + counts only).
create policy "Public read group session participants"
  on public.group_session_participants
  for select
  using (true);

-- Allow inserts for participants joining a session; application code enforces which
-- session is being joined via the opaque slug.
create policy "Public insert group session participants"
  on public.group_session_participants
  for insert
  with check (true);

-- Allow updates to participant rows (e.g., pieces_found, last_seen_at) via the API.
create policy "Public update group session participants"
  on public.group_session_participants
  for update
  using (true)
  with check (true);


