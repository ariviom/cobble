-- Normalize legacy statuses before shrinking the enum.
update public.user_sets
set status = 'want'
where status in ('can_build', 'partial');

-- Recreate enum without the legacy values (‘can_build’, ‘partial’).
create type public.set_status_new as enum ('owned', 'want');

alter table public.user_sets
  alter column status type public.set_status_new
  using status::text::public.set_status_new;

drop type public.set_status;

alter type public.set_status_new rename to set_status;

