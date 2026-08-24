-- Once ownership of the original personal Household moves to another user, it
-- becomes a shared plan. Releasing the creator's personal-Household slot lets
-- the normal fallback resolver create a clean personal Household if the former
-- owner later leaves or is removed.
create or replace function public.awn_transfer_household_ownership(p_household_id uuid, p_member_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household_id::text, 0));
  if not private.awn_is_household_owner(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_owner_required';
  end if;
  if not exists (
    select 1 from public.household_members as membership
    where membership.household_id = p_household_id and membership.user_id = p_member_user_id and membership.role = 'member'
  ) then raise exception using errcode = 'P0001', message = 'household_member_not_found'; end if;

  update public.household_members as membership
  set role = case when membership.user_id = v_user_id then 'member' else 'owner' end
  where membership.household_id = p_household_id and membership.user_id in (v_user_id, p_member_user_id);

  if (select count(*) from public.household_members as membership where membership.household_id = p_household_id and membership.role = 'owner') <> 1 then
    raise exception using errcode = 'P0001', message = 'household_owner_invariant';
  end if;

  update public.households as household
  set is_personal = false, updated_at = now()
  where household.id = p_household_id and household.is_personal;

  return true;
end;
$$;

alter function public.awn_transfer_household_ownership(uuid, uuid) owner to postgres;
revoke all on function public.awn_transfer_household_ownership(uuid, uuid) from public, anon, authenticated;
grant execute on function public.awn_transfer_household_ownership(uuid, uuid) to authenticated;
