drop extension if exists "pg_net";

drop policy "Delete own list items" on "public"."user_list_items";

drop policy "Insert own list items" on "public"."user_list_items";

drop policy "Select list items when profile lists public" on "public"."user_list_items";

drop policy "Select own list items" on "public"."user_list_items";

drop policy "Delete own lists" on "public"."user_lists";

drop policy "Insert own lists" on "public"."user_lists";

drop policy "Select lists when profile lists public" on "public"."user_lists";

drop policy "Select own lists" on "public"."user_lists";

drop policy "Update own lists" on "public"."user_lists";

drop policy "Delete own minifigs" on "public"."user_minifigs";

drop policy "Insert own minifigs" on "public"."user_minifigs";

drop policy "Select minifigs when profile lists public" on "public"."user_minifigs";

drop policy "Select own minifigs" on "public"."user_minifigs";

drop policy "Update own minifigs" on "public"."user_minifigs";

drop policy "Select public profiles when lists public" on "public"."user_profiles";

drop policy "Select sets when profile lists public" on "public"."user_sets";

drop policy "Select user profiles" on "public"."user_profiles";

drop policy "Select user sets" on "public"."user_sets";

revoke delete on table "public"."user_list_items" from "anon";

revoke insert on table "public"."user_list_items" from "anon";

revoke references on table "public"."user_list_items" from "anon";

revoke select on table "public"."user_list_items" from "anon";

revoke trigger on table "public"."user_list_items" from "anon";

revoke truncate on table "public"."user_list_items" from "anon";

revoke update on table "public"."user_list_items" from "anon";

revoke delete on table "public"."user_list_items" from "authenticated";

revoke insert on table "public"."user_list_items" from "authenticated";

revoke references on table "public"."user_list_items" from "authenticated";

revoke select on table "public"."user_list_items" from "authenticated";

revoke trigger on table "public"."user_list_items" from "authenticated";

revoke truncate on table "public"."user_list_items" from "authenticated";

revoke update on table "public"."user_list_items" from "authenticated";

revoke delete on table "public"."user_list_items" from "service_role";

revoke insert on table "public"."user_list_items" from "service_role";

revoke references on table "public"."user_list_items" from "service_role";

revoke select on table "public"."user_list_items" from "service_role";

revoke trigger on table "public"."user_list_items" from "service_role";

revoke truncate on table "public"."user_list_items" from "service_role";

revoke update on table "public"."user_list_items" from "service_role";

revoke delete on table "public"."user_lists" from "anon";

revoke insert on table "public"."user_lists" from "anon";

revoke references on table "public"."user_lists" from "anon";

revoke select on table "public"."user_lists" from "anon";

revoke trigger on table "public"."user_lists" from "anon";

revoke truncate on table "public"."user_lists" from "anon";

revoke update on table "public"."user_lists" from "anon";

revoke delete on table "public"."user_lists" from "authenticated";

revoke insert on table "public"."user_lists" from "authenticated";

revoke references on table "public"."user_lists" from "authenticated";

revoke select on table "public"."user_lists" from "authenticated";

revoke trigger on table "public"."user_lists" from "authenticated";

revoke truncate on table "public"."user_lists" from "authenticated";

revoke update on table "public"."user_lists" from "authenticated";

revoke delete on table "public"."user_lists" from "service_role";

revoke insert on table "public"."user_lists" from "service_role";

revoke references on table "public"."user_lists" from "service_role";

revoke select on table "public"."user_lists" from "service_role";

revoke trigger on table "public"."user_lists" from "service_role";

revoke truncate on table "public"."user_lists" from "service_role";

revoke update on table "public"."user_lists" from "service_role";

revoke delete on table "public"."user_minifigs" from "anon";

revoke insert on table "public"."user_minifigs" from "anon";

revoke references on table "public"."user_minifigs" from "anon";

revoke select on table "public"."user_minifigs" from "anon";

revoke trigger on table "public"."user_minifigs" from "anon";

revoke truncate on table "public"."user_minifigs" from "anon";

revoke update on table "public"."user_minifigs" from "anon";

revoke delete on table "public"."user_minifigs" from "authenticated";

revoke insert on table "public"."user_minifigs" from "authenticated";

revoke references on table "public"."user_minifigs" from "authenticated";

revoke select on table "public"."user_minifigs" from "authenticated";

revoke trigger on table "public"."user_minifigs" from "authenticated";

revoke truncate on table "public"."user_minifigs" from "authenticated";

revoke update on table "public"."user_minifigs" from "authenticated";

revoke delete on table "public"."user_minifigs" from "service_role";

revoke insert on table "public"."user_minifigs" from "service_role";

revoke references on table "public"."user_minifigs" from "service_role";

revoke select on table "public"."user_minifigs" from "service_role";

revoke trigger on table "public"."user_minifigs" from "service_role";

revoke truncate on table "public"."user_minifigs" from "service_role";

revoke update on table "public"."user_minifigs" from "service_role";

alter table "public"."user_list_items" drop constraint "user_list_items_list_id_fkey";

alter table "public"."user_list_items" drop constraint "user_list_items_minifig_id_fkey";

alter table "public"."user_list_items" drop constraint "user_list_items_set_num_fkey";

alter table "public"."user_list_items" drop constraint "user_list_items_target_check";

alter table "public"."user_list_items" drop constraint "user_list_items_user_id_fkey";

alter table "public"."user_lists" drop constraint "user_lists_user_id_fkey";

alter table "public"."user_minifigs" drop constraint "user_minifigs_fig_num_fkey";

alter table "public"."user_minifigs" drop constraint "user_minifigs_user_id_fkey";

alter table "public"."user_lists" drop constraint "user_lists_pkey";

alter table "public"."user_minifigs" drop constraint "user_minifigs_pkey";

drop index if exists "public"."user_list_items_minifig_unique";

drop index if exists "public"."user_list_items_set_unique";

drop index if exists "public"."user_list_items_user_idx";

drop index if exists "public"."user_lists_pkey";

drop index if exists "public"."user_lists_user_name_unique";

drop index if exists "public"."user_minifigs_pkey";

drop index if exists "public"."user_minifigs_status_idx";

drop table "public"."user_list_items";

drop table "public"."user_lists";

drop table "public"."user_minifigs";


  create table "public"."bl_minifig_parts" (
    "bl_minifig_no" text not null,
    "bl_part_id" text not null,
    "bl_color_id" integer not null,
    "quantity" integer not null default 1,
    "name" text,
    "last_refreshed_at" timestamp with time zone
      );


alter table "public"."bl_minifig_parts" enable row level security;


  create table "public"."part_id_mappings" (
    "rb_part_id" text not null,
    "bl_part_id" text not null,
    "source" text not null,
    "confidence" numeric,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."part_id_mappings" enable row level security;


  create table "public"."user_collection_sets" (
    "collection_id" uuid not null,
    "user_id" uuid not null,
    "set_num" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."user_collection_sets" enable row level security;


  create table "public"."user_collections" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "is_system" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."user_collections" enable row level security;

alter table "public"."bricklink_minifigs" add column "last_parts_sync_at" timestamp with time zone;

alter table "public"."bricklink_minifigs" add column "parts_sync_status" text;

alter table "public"."user_profiles" drop column "lists_public";

alter table "public"."user_profiles" add column "collections_public" boolean not null default false;

drop type "public"."collection_item_type";

CREATE INDEX bl_minifig_parts_minifig_idx ON public.bl_minifig_parts USING btree (bl_minifig_no);

CREATE UNIQUE INDEX bl_minifig_parts_pkey ON public.bl_minifig_parts USING btree (bl_minifig_no, bl_part_id, bl_color_id);

CREATE INDEX part_id_mappings_bl_part_idx ON public.part_id_mappings USING btree (bl_part_id);

CREATE UNIQUE INDEX part_id_mappings_pkey ON public.part_id_mappings USING btree (rb_part_id);

CREATE UNIQUE INDEX user_collection_sets_pkey ON public.user_collection_sets USING btree (collection_id, set_num);

CREATE INDEX user_collection_sets_set_num_idx ON public.user_collection_sets USING btree (set_num);

CREATE INDEX user_collection_sets_user_set_idx ON public.user_collection_sets USING btree (user_id, set_num);

CREATE UNIQUE INDEX user_collections_pkey ON public.user_collections USING btree (id);

CREATE UNIQUE INDEX user_collections_user_name_unique ON public.user_collections USING btree (user_id, lower(name));

alter table "public"."bl_minifig_parts" add constraint "bl_minifig_parts_pkey" PRIMARY KEY using index "bl_minifig_parts_pkey";

alter table "public"."part_id_mappings" add constraint "part_id_mappings_pkey" PRIMARY KEY using index "part_id_mappings_pkey";

alter table "public"."user_collection_sets" add constraint "user_collection_sets_pkey" PRIMARY KEY using index "user_collection_sets_pkey";

alter table "public"."user_collections" add constraint "user_collections_pkey" PRIMARY KEY using index "user_collections_pkey";

alter table "public"."user_collection_sets" add constraint "user_collection_sets_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES public.user_collections(id) ON DELETE CASCADE not valid;

alter table "public"."user_collection_sets" validate constraint "user_collection_sets_collection_id_fkey";

alter table "public"."user_collection_sets" add constraint "user_collection_sets_set_num_fkey" FOREIGN KEY (set_num) REFERENCES public.rb_sets(set_num) ON DELETE CASCADE not valid;

alter table "public"."user_collection_sets" validate constraint "user_collection_sets_set_num_fkey";

alter table "public"."user_collection_sets" add constraint "user_collection_sets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_collection_sets" validate constraint "user_collection_sets_user_id_fkey";

alter table "public"."user_collections" add constraint "user_collections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_collections" validate constraint "user_collections_user_id_fkey";

grant delete on table "public"."bl_minifig_parts" to "anon";

grant insert on table "public"."bl_minifig_parts" to "anon";

grant references on table "public"."bl_minifig_parts" to "anon";

grant select on table "public"."bl_minifig_parts" to "anon";

grant trigger on table "public"."bl_minifig_parts" to "anon";

grant truncate on table "public"."bl_minifig_parts" to "anon";

grant update on table "public"."bl_minifig_parts" to "anon";

grant delete on table "public"."bl_minifig_parts" to "authenticated";

grant insert on table "public"."bl_minifig_parts" to "authenticated";

grant references on table "public"."bl_minifig_parts" to "authenticated";

grant select on table "public"."bl_minifig_parts" to "authenticated";

grant trigger on table "public"."bl_minifig_parts" to "authenticated";

grant truncate on table "public"."bl_minifig_parts" to "authenticated";

grant update on table "public"."bl_minifig_parts" to "authenticated";

grant delete on table "public"."bl_minifig_parts" to "service_role";

grant insert on table "public"."bl_minifig_parts" to "service_role";

grant references on table "public"."bl_minifig_parts" to "service_role";

grant select on table "public"."bl_minifig_parts" to "service_role";

grant trigger on table "public"."bl_minifig_parts" to "service_role";

grant truncate on table "public"."bl_minifig_parts" to "service_role";

grant update on table "public"."bl_minifig_parts" to "service_role";

grant delete on table "public"."part_id_mappings" to "anon";

grant insert on table "public"."part_id_mappings" to "anon";

grant references on table "public"."part_id_mappings" to "anon";

grant select on table "public"."part_id_mappings" to "anon";

grant trigger on table "public"."part_id_mappings" to "anon";

grant truncate on table "public"."part_id_mappings" to "anon";

grant update on table "public"."part_id_mappings" to "anon";

grant delete on table "public"."part_id_mappings" to "authenticated";

grant insert on table "public"."part_id_mappings" to "authenticated";

grant references on table "public"."part_id_mappings" to "authenticated";

grant select on table "public"."part_id_mappings" to "authenticated";

grant trigger on table "public"."part_id_mappings" to "authenticated";

grant truncate on table "public"."part_id_mappings" to "authenticated";

grant update on table "public"."part_id_mappings" to "authenticated";

grant delete on table "public"."part_id_mappings" to "service_role";

grant insert on table "public"."part_id_mappings" to "service_role";

grant references on table "public"."part_id_mappings" to "service_role";

grant select on table "public"."part_id_mappings" to "service_role";

grant trigger on table "public"."part_id_mappings" to "service_role";

grant truncate on table "public"."part_id_mappings" to "service_role";

grant update on table "public"."part_id_mappings" to "service_role";

grant delete on table "public"."user_collection_sets" to "anon";

grant insert on table "public"."user_collection_sets" to "anon";

grant references on table "public"."user_collection_sets" to "anon";

grant select on table "public"."user_collection_sets" to "anon";

grant trigger on table "public"."user_collection_sets" to "anon";

grant truncate on table "public"."user_collection_sets" to "anon";

grant update on table "public"."user_collection_sets" to "anon";

grant delete on table "public"."user_collection_sets" to "authenticated";

grant insert on table "public"."user_collection_sets" to "authenticated";

grant references on table "public"."user_collection_sets" to "authenticated";

grant select on table "public"."user_collection_sets" to "authenticated";

grant trigger on table "public"."user_collection_sets" to "authenticated";

grant truncate on table "public"."user_collection_sets" to "authenticated";

grant update on table "public"."user_collection_sets" to "authenticated";

grant delete on table "public"."user_collection_sets" to "service_role";

grant insert on table "public"."user_collection_sets" to "service_role";

grant references on table "public"."user_collection_sets" to "service_role";

grant select on table "public"."user_collection_sets" to "service_role";

grant trigger on table "public"."user_collection_sets" to "service_role";

grant truncate on table "public"."user_collection_sets" to "service_role";

grant update on table "public"."user_collection_sets" to "service_role";

grant delete on table "public"."user_collections" to "anon";

grant insert on table "public"."user_collections" to "anon";

grant references on table "public"."user_collections" to "anon";

grant select on table "public"."user_collections" to "anon";

grant trigger on table "public"."user_collections" to "anon";

grant truncate on table "public"."user_collections" to "anon";

grant update on table "public"."user_collections" to "anon";

grant delete on table "public"."user_collections" to "authenticated";

grant insert on table "public"."user_collections" to "authenticated";

grant references on table "public"."user_collections" to "authenticated";

grant select on table "public"."user_collections" to "authenticated";

grant trigger on table "public"."user_collections" to "authenticated";

grant truncate on table "public"."user_collections" to "authenticated";

grant update on table "public"."user_collections" to "authenticated";

grant delete on table "public"."user_collections" to "service_role";

grant insert on table "public"."user_collections" to "service_role";

grant references on table "public"."user_collections" to "service_role";

grant select on table "public"."user_collections" to "service_role";

grant trigger on table "public"."user_collections" to "service_role";

grant truncate on table "public"."user_collections" to "service_role";

grant update on table "public"."user_collections" to "service_role";


  create policy "Delete own collection sets"
  on "public"."user_collection_sets"
  as permissive
  for delete
  to public
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Insert own collection sets"
  on "public"."user_collection_sets"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Select user collection sets"
  on "public"."user_collection_sets"
  as permissive
  for select
  to public
using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.user_id = user_collection_sets.user_id) AND (p.collections_public = true))))));



  create policy "Delete own collections"
  on "public"."user_collections"
  as permissive
  for delete
  to public
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Insert own collections"
  on "public"."user_collections"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Select user collections"
  on "public"."user_collections"
  as permissive
  for select
  to public
using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.user_id = user_collections.user_id) AND (p.collections_public = true))))));



  create policy "Update own collections"
  on "public"."user_collections"
  as permissive
  for update
  to public
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Select user profiles"
  on "public"."user_profiles"
  as permissive
  for select
  to public
using (((( SELECT auth.uid() AS uid) = user_id) OR (collections_public = true)));



  create policy "Select user sets"
  on "public"."user_sets"
  as permissive
  for select
  to public
using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.user_profiles p
  WHERE ((p.user_id = user_sets.user_id) AND (p.collections_public = true))))));



