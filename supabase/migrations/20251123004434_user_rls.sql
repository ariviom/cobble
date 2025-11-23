alter table public.user_profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_sets enable row level security;
alter table public.user_set_parts enable row level security;
alter table public.user_parts_inventory enable row level security;


-- user_profiles policies
create policy "Select own profile" on public.user_profiles
  for select
  using (auth.uid() = user_id);

create policy "Insert own profile" on public.user_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Update own profile" on public.user_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own profile" on public.user_profiles
  for delete
  using (auth.uid() = user_id);


-- user_preferences policies
create policy "Select own preferences" on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "Insert own preferences" on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "Update own preferences" on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own preferences" on public.user_preferences
  for delete
  using (auth.uid() = user_id);


-- user_sets policies
create policy "Select own sets" on public.user_sets
  for select
  using (auth.uid() = user_id);

create policy "Insert own sets" on public.user_sets
  for insert
  with check (auth.uid() = user_id);

create policy "Update own sets" on public.user_sets
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own sets" on public.user_sets
  for delete
  using (auth.uid() = user_id);


-- user_set_parts policies
create policy "Select own set parts" on public.user_set_parts
  for select
  using (auth.uid() = user_id);

create policy "Insert own set parts" on public.user_set_parts
  for insert
  with check (auth.uid() = user_id);

create policy "Update own set parts" on public.user_set_parts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own set parts" on public.user_set_parts
  for delete
  using (auth.uid() = user_id);


-- user_parts_inventory policies
create policy "Select own parts inventory" on public.user_parts_inventory
  for select
  using (auth.uid() = user_id);

create policy "Insert own parts inventory" on public.user_parts_inventory
  for insert
  with check (auth.uid() = user_id);

create policy "Update own parts inventory" on public.user_parts_inventory
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own parts inventory" on public.user_parts_inventory
  for delete
  using (auth.uid() = user_id);



