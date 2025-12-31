-- Create user_feedback table for storing user feedback submissions
create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  
  -- Constraints
  constraint name_length check (char_length(name) >= 1 and char_length(name) <= 100),
  constraint message_length check (char_length(message) >= 1 and char_length(message) <= 2000)
);

-- Enable RLS
alter table public.user_feedback enable row level security;

-- Policies: Users can insert their own feedback and read their own submissions
create policy "Users can insert their own feedback"
  on public.user_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can view their own feedback"
  on public.user_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Index for efficient user lookups
create index user_feedback_user_id_idx on public.user_feedback(user_id);
create index user_feedback_created_at_idx on public.user_feedback(created_at desc);
