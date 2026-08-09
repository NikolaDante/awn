-- Repair automatic financial-profile creation omitted from the initial cloud foundation.
--
-- The auth.users trigger runs outside an end-user JWT context. Its SECURITY DEFINER
-- function is therefore owned by postgres and limited to inserting a profile for NEW.id.
-- It has an empty search path, references every database object by schema, accepts no
-- arguments, and is not executable directly by client roles. Trigger execution does not
-- require clients to have EXECUTE permission on the function.

-- The initial ownership guard correctly rejects ordinary writes without auth.uid().
-- Permit only a postgres-owned INSERT into financial_profiles so the narrowly scoped
-- auth trigger and this migration's backfill can pass that guard. PostgreSQL already
-- controls this role; authenticated client writes still require auth.uid() ownership.
create or replace function public.awn_assign_authenticated_user_id()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  authenticated_user_id uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Row ownership cannot be reassigned';
  end if;

  if authenticated_user_id is null then
    if current_user = 'postgres'
      and tg_op = 'INSERT'
      and tg_table_schema = 'public'
      and tg_table_name = 'financial_profiles'
      and new.user_id is not null then
      return new;
    end if;

    raise exception 'An authenticated user is required';
  end if;

  if new.user_id is null then new.user_id := authenticated_user_id; end if;
  if new.user_id <> authenticated_user_id then
    raise exception 'A row may only belong to the authenticated user';
  end if;
  return new;
end;
$$;

revoke all on function public.awn_assign_authenticated_user_id() from public, anon, authenticated;

create or replace function public.awn_create_financial_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financial_profiles (user_id, currency)
  values (new.id, 'AED')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter function public.awn_create_financial_profile_for_auth_user() owner to postgres;
revoke all on function public.awn_create_financial_profile_for_auth_user() from public, anon, authenticated;

-- Drop only AWN's known trigger name before recreating it. This gives one predictable
-- AFTER INSERT trigger if the repair is reapplied during local database development.
drop trigger if exists awn_create_financial_profile_after_auth_user_insert on auth.users;
create trigger awn_create_financial_profile_after_auth_user_insert
after insert on auth.users
for each row
execute function public.awn_create_financial_profile_for_auth_user();

-- Repair users created before the trigger existed. The anti-join avoids existing rows;
-- ON CONFLICT is a second idempotency guard and never updates an existing profile.
insert into public.financial_profiles (user_id, currency)
select existing_user.id, 'AED'
from auth.users as existing_user
where not exists (
  select 1
  from public.financial_profiles as existing_profile
  where existing_profile.user_id = existing_user.id
)
on conflict (user_id) do nothing;
