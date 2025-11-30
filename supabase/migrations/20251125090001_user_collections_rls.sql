alter table public.user_collections enable row level security;
alter table public.user_collection_sets enable row level security;
-- user_collections policies
create policy "Select own collections" on public.user_collections
  for select
  using (auth.uid() = user_id);
create policy "Insert own collections" on public.user_collections
  for insert
  with check (auth.uid() = user_id);
create policy "Update own collections" on public.user_collections
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "Delete own collections" on public.user_collections
  for delete
  using (auth.uid() = user_id);
-- user_collection_sets policies
create policy "Select own collection sets" on public.user_collection_sets
  for select
  using (auth.uid() = user_id);
create policy "Insert own collection sets" on public.user_collection_sets
  for insert
  with check (auth.uid() = user_id);
create policy "Delete own collection sets" on public.user_collection_sets
  for delete
  using (auth.uid() = user_id);



