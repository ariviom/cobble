-- Relax foreign key from user_set_parts to rb_set_parts.
-- We currently derive inventories primarily from rb_inventory_parts and do not
-- maintain a denormalized rb_set_parts table for every part/color in a set.
-- This constraint causes inserts into user_set_parts to fail when the
-- corresponding rb_set_parts row is missing.

alter table public.user_set_parts
  drop constraint if exists user_set_parts_inventory_fk;


