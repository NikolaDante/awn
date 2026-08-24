-- Resolve the output-column name collision in the idempotent membership insert.

create or replace function public.awn_accept_household_invitation(p_invitation_token text)
returns table (household_id uuid, household_name text, onboarding_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_hash text := encode(extensions.digest(coalesce(p_invitation_token, ''), 'sha256'), 'hex');
  v_invitation public.household_invitations%rowtype;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  perform private.awn_ensure_personal_household(v_user_id);
  select private.awn_normalize_email(existing_user.email) into v_user_email from auth.users as existing_user where existing_user.id = v_user_id;
  select * into v_invitation from public.household_invitations as invitation where invitation.token_hash = v_hash for update;
  if not found then raise exception using errcode = 'P0001', message = 'invitation_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_invitation.household_id::text, 0));
  if v_user_email <> v_invitation.invited_email then raise exception using errcode = '42501', message = 'invitation_email_mismatch'; end if;
  if v_invitation.status = 'accepted' and exists (
    select 1 from public.household_members as membership where membership.household_id = v_invitation.household_id and membership.user_id = v_user_id
  ) then
    insert into public.user_preferences (user_id, active_household_id) values (v_user_id, v_invitation.household_id)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  else
    if v_invitation.status <> 'pending' then raise exception using errcode = 'P0001', message = 'invitation_not_pending'; end if;
    if v_invitation.expires_at <= now() then raise exception using errcode = 'P0001', message = 'invitation_expired'; end if;
    if (select count(*) from public.household_members as membership where membership.household_id = v_invitation.household_id) >= 2 then raise exception using errcode = 'P0001', message = 'household_member_limit'; end if;
    insert into public.household_members (household_id, user_id, role) values (v_invitation.household_id, v_user_id, 'member')
    on conflict on constraint household_members_pkey do nothing;
    update public.household_invitations set status = 'accepted', accepted_by_user_id = v_user_id, updated_at = now() where id = v_invitation.id;
    insert into public.user_preferences (user_id, active_household_id) values (v_user_id, v_invitation.household_id)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  end if;
  return query select household.id, household.name, profile.onboarding_completed
  from public.households as household join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_invitation.household_id;
end;
$$;

alter function public.awn_accept_household_invitation(text) owner to postgres;
revoke all on function public.awn_accept_household_invitation(text) from public, anon, authenticated;
grant execute on function public.awn_accept_household_invitation(text) to authenticated;
