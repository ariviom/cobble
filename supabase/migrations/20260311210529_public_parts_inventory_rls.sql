-- Allow public profile viewers to see parts inventory
create policy "Public profiles can view parts inventory"
  on user_parts_inventory for select
  using (exists (
    select 1 from user_profiles
    where user_profiles.user_id = user_parts_inventory.user_id
    and user_profiles.lists_public = true
  ));