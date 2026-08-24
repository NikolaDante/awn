-- Phase 4A hosted-lint repairs: pgcrypto lives in Supabase's extensions schema,
-- and auth.users.email is varchar while the public member-summary contract is text.

create or replace function public.awn_list_household_members(p_household_id uuid)
returns table (user_id uuid, display_name text, email text, role text, is_current_user boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_member(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_access_denied';
  end if;
  return query
  select membership.user_id,
    coalesce(nullif(preferences.display_name, ''), nullif(split_part(existing_user.email, '@', 1), ''), 'AWN member'),
    coalesce(existing_user.email, '')::text, membership.role, membership.user_id = v_user_id
  from public.household_members as membership
  join auth.users as existing_user on existing_user.id = membership.user_id
  left join public.user_preferences as preferences on preferences.user_id = membership.user_id
  where membership.household_id = p_household_id
  order by (membership.role = 'owner') desc, membership.created_at, membership.user_id;
end;
$$;

create or replace function public.awn_create_household_invitation(p_household_id uuid, p_invited_email text)
returns table (invitation_id uuid, invited_email text, invitation_status text, expires_at timestamptz, invitation_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := private.awn_normalize_email(p_invited_email);
  v_own_email text;
  v_token text;
  v_invitation public.household_invitations%rowtype;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_owner(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_owner_required'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception using errcode = 'P0001', message = 'invalid_invitation_email'; end if;
  select private.awn_normalize_email(existing_user.email) into v_own_email from auth.users as existing_user where existing_user.id = v_user_id;
  if v_email = v_own_email then raise exception using errcode = 'P0001', message = 'cannot_invite_self'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household_id::text, 0));
  update public.household_invitations as invitation set status = 'expired', updated_at = now()
  where invitation.household_id = p_household_id and invitation.status = 'pending' and invitation.expires_at <= now();
  if (select count(*) from public.household_members as membership where membership.household_id = p_household_id) >= 2 then raise exception using errcode = 'P0001', message = 'household_member_limit'; end if;
  if exists (
    select 1 from public.household_members as membership join auth.users as existing_user on existing_user.id = membership.user_id
    where membership.household_id = p_household_id and private.awn_normalize_email(existing_user.email) = v_email
  ) then raise exception using errcode = 'P0001', message = 'already_household_member'; end if;
  if exists (
    select 1 from public.household_invitations as invitation
    where invitation.household_id = p_household_id and invitation.invited_email = v_email and invitation.status = 'pending'
  ) then raise exception using errcode = 'P0001', message = 'duplicate_pending_invitation'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.household_invitations (household_id, invited_email, token_hash, expires_at, created_by_user_id)
  values (p_household_id, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days', v_user_id)
  returning * into v_invitation;
  return query select v_invitation.id, v_invitation.invited_email, v_invitation.status, v_invitation.expires_at, v_token;
end;
$$;

create or replace function public.awn_refresh_household_invitation(p_invitation_id uuid)
returns table (invitation_id uuid, invited_email text, expires_at timestamptz, invitation_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text;
  v_invitation public.household_invitations%rowtype;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  select * into v_invitation from public.household_invitations as invitation where invitation.id = p_invitation_id for update;
  if not found or not private.awn_is_household_owner(v_invitation.household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_owner_required'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then raise exception using errcode = 'P0001', message = 'invitation_not_pending'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.household_invitations as invitation
  set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'), updated_at = now()
  where invitation.id = p_invitation_id returning * into v_invitation;
  return query select v_invitation.id, v_invitation.invited_email, v_invitation.expires_at, v_token;
end;
$$;

create or replace function public.awn_get_household_invitation_preview(p_invitation_token text)
returns table (household_name text, invited_by text, invitation_status text, expires_at timestamptz, is_authenticated boolean, email_matches boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text := encode(extensions.digest(coalesce(p_invitation_token, ''), 'sha256'), 'hex');
begin
  return query
  select household.name,
    coalesce(nullif(preferences.display_name, ''), nullif(split_part(inviter.email, '@', 1), ''), 'An AWN member'),
    case when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired' else invitation.status end,
    invitation.expires_at, v_user_id is not null,
    v_user_id is not null and private.awn_normalize_email(current_user_record.email) = invitation.invited_email
  from public.household_invitations as invitation
  join public.households as household on household.id = invitation.household_id
  join auth.users as inviter on inviter.id = invitation.created_by_user_id
  left join public.user_preferences as preferences on preferences.user_id = inviter.id
  left join auth.users as current_user_record on current_user_record.id = v_user_id
  where invitation.token_hash = v_hash limit 1;
end;
$$;

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
    on conflict (household_id, user_id) do nothing;
    update public.household_invitations set status = 'accepted', accepted_by_user_id = v_user_id, updated_at = now() where id = v_invitation.id;
    insert into public.user_preferences (user_id, active_household_id) values (v_user_id, v_invitation.household_id)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  end if;
  return query select household.id, household.name, profile.onboarding_completed
  from public.households as household join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_invitation.household_id;
end;
$$;

create or replace function public.awn_decline_household_invitation(p_invitation_token text)
returns boolean
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
  select private.awn_normalize_email(existing_user.email) into v_user_email from auth.users as existing_user where existing_user.id = v_user_id;
  select * into v_invitation from public.household_invitations as invitation where invitation.token_hash = v_hash for update;
  if not found then raise exception using errcode = 'P0001', message = 'invitation_not_found'; end if;
  if v_user_email <> v_invitation.invited_email then raise exception using errcode = '42501', message = 'invitation_email_mismatch'; end if;
  if v_invitation.status <> 'pending' then raise exception using errcode = 'P0001', message = 'invitation_not_pending'; end if;
  if v_invitation.expires_at <= now() then raise exception using errcode = 'P0001', message = 'invitation_expired'; end if;
  update public.household_invitations set status = 'declined', updated_at = now() where id = v_invitation.id;
  return true;
end;
$$;

alter function public.awn_list_household_members(uuid) owner to postgres;
alter function public.awn_create_household_invitation(uuid, text) owner to postgres;
alter function public.awn_refresh_household_invitation(uuid) owner to postgres;
alter function public.awn_get_household_invitation_preview(text) owner to postgres;
alter function public.awn_accept_household_invitation(text) owner to postgres;
alter function public.awn_decline_household_invitation(text) owner to postgres;

revoke all on function public.awn_list_household_members(uuid) from public, anon, authenticated;
revoke all on function public.awn_create_household_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.awn_refresh_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.awn_get_household_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.awn_accept_household_invitation(text) from public, anon, authenticated;
revoke all on function public.awn_decline_household_invitation(text) from public, anon, authenticated;

grant execute on function public.awn_list_household_members(uuid) to authenticated;
grant execute on function public.awn_create_household_invitation(uuid, text) to authenticated;
grant execute on function public.awn_refresh_household_invitation(uuid) to authenticated;
grant execute on function public.awn_get_household_invitation_preview(text) to anon, authenticated;
grant execute on function public.awn_accept_household_invitation(text) to authenticated;
grant execute on function public.awn_decline_household_invitation(text) to authenticated;
