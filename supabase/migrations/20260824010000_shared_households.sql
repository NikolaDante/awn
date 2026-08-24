-- AWN Phase 4A: secure two-person shared Households.
-- Financial rows remain Household-scoped and continue to use the Phase 3 RLS boundary.

alter table public.user_preferences
  add column active_household_id uuid references public.households(id) on delete set null;

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_email text not null check (
    invited_email = lower(btrim(invited_email))
    and length(invited_email) between 3 and 320
  ),
  role text not null default 'member' check (role = 'member'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_invitations_household_idx
  on public.household_invitations (household_id, status, expires_at desc);
create unique index household_invitations_pending_email_idx
  on public.household_invitations (household_id, invited_email)
  where status = 'pending';

alter table public.household_invitations enable row level security;
revoke all on table public.household_invitations from public, anon, authenticated;

create or replace function private.awn_normalize_email(p_email text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$ select lower(btrim(coalesce(p_email, ''))); $$;

create or replace function private.awn_is_household_owner(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.household_members as membership
    where membership.household_id = p_household_id
      and membership.user_id = p_user_id
      and membership.role = 'owner'
  );
$$;

create or replace function private.awn_fallback_household(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select membership.household_id into v_household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = p_user_id and membership.role = 'owner'
  order by household.is_personal desc, household.created_at, household.id
  limit 1;

  if v_household_id is null then
    select membership.household_id into v_household_id
    from public.household_members as membership
    join public.households as household on household.id = membership.household_id
    where membership.user_id = p_user_id
    order by household.created_at, household.id
    limit 1;
  end if;

  if v_household_id is null then
    v_household_id := private.awn_ensure_personal_household(p_user_id);
  end if;
  return v_household_id;
end;
$$;

create or replace function public.awn_resolve_active_household(p_requested_household_id uuid default null)
returns table (
  household_id uuid,
  household_name text,
  member_role text,
  member_count bigint,
  is_personal boolean,
  profile_data jsonb,
  revision bigint,
  initialized_at timestamptz,
  migrated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  perform private.awn_ensure_personal_household(v_user_id);

  if p_requested_household_id is not null and private.awn_is_household_member(p_requested_household_id, v_user_id) then
    v_household_id := p_requested_household_id;
  else
    select preferences.active_household_id into v_household_id
    from public.user_preferences as preferences
    where preferences.user_id = v_user_id
      and private.awn_is_household_member(preferences.active_household_id, v_user_id);
  end if;

  if v_household_id is null then v_household_id := private.awn_fallback_household(v_user_id); end if;

  insert into public.user_preferences (user_id, active_household_id)
  values (v_user_id, v_household_id)
  on conflict (user_id) do update
    set active_household_id = excluded.active_household_id, updated_at = now();

  return query
  select household.id, household.name, membership.role,
    (select count(*) from public.household_members as counted where counted.household_id = household.id),
    household.is_personal, profile.profile_data, profile.revision, profile.initialized_at, profile.migrated_at
  from public.households as household
  join public.household_members as membership
    on membership.household_id = household.id and membership.user_id = v_user_id
  join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_household_id;
end;
$$;

-- Compatibility wrapper for existing clients; selection is no longer hardcoded personal.
drop function public.awn_resolve_personal_household();
create function public.awn_resolve_personal_household()
returns table (
  household_id uuid,
  household_name text,
  member_role text,
  member_count bigint,
  profile_data jsonb,
  revision bigint,
  initialized_at timestamptz,
  migrated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select resolved.household_id, resolved.household_name, resolved.member_role, resolved.member_count,
    resolved.profile_data, resolved.revision, resolved.initialized_at, resolved.migrated_at
  from public.awn_resolve_active_household(null) as resolved;
$$;

create function public.awn_list_households()
returns table (
  household_id uuid,
  household_name text,
  member_role text,
  member_count bigint,
  is_personal boolean,
  onboarding_completed boolean,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  perform private.awn_ensure_personal_household(v_user_id);
  select preferences.active_household_id into v_active_id
  from public.user_preferences as preferences where preferences.user_id = v_user_id;
  if v_active_id is null or not private.awn_is_household_member(v_active_id, v_user_id) then
    v_active_id := private.awn_fallback_household(v_user_id);
  end if;

  return query
  select household.id, household.name, membership.role,
    (select count(*) from public.household_members as counted where counted.household_id = household.id),
    household.is_personal, profile.onboarding_completed, household.id = v_active_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  join public.financial_profiles as profile on profile.household_id = household.id
  where membership.user_id = v_user_id
  order by (household.id = v_active_id) desc, (membership.role = 'owner') desc,
    household.is_personal desc, household.created_at, household.id;
end;
$$;

create function public.awn_list_household_members(p_household_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  is_current_user boolean
)
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
    coalesce(existing_user.email, ''), membership.role, membership.user_id = v_user_id
  from public.household_members as membership
  join auth.users as existing_user on existing_user.id = membership.user_id
  left join public.user_preferences as preferences on preferences.user_id = membership.user_id
  where membership.household_id = p_household_id
  order by (membership.role = 'owner') desc, membership.created_at, membership.user_id;
end;
$$;

create function public.awn_list_household_invitations(p_household_id uuid)
returns table (
  invitation_id uuid,
  invited_email text,
  invitation_status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_owner(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_owner_required';
  end if;
  update public.household_invitations as invitation
  set status = 'expired', updated_at = now()
  where invitation.household_id = p_household_id and invitation.status = 'pending' and invitation.expires_at <= now();
  return query
  select invitation.id, invitation.invited_email, invitation.status, invitation.expires_at, invitation.created_at
  from public.household_invitations as invitation
  where invitation.household_id = p_household_id
  order by (invitation.status = 'pending') desc, invitation.created_at desc;
end;
$$;

create function public.awn_create_household_invitation(p_household_id uuid, p_invited_email text)
returns table (
  invitation_id uuid,
  invited_email text,
  invitation_status text,
  expires_at timestamptz,
  invitation_token text
)
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
  if not private.awn_is_household_owner(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_owner_required';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = 'P0001', message = 'invalid_invitation_email';
  end if;
  select private.awn_normalize_email(existing_user.email) into v_own_email
  from auth.users as existing_user where existing_user.id = v_user_id;
  if v_email = v_own_email then raise exception using errcode = 'P0001', message = 'cannot_invite_self'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_household_id::text, 0));
  update public.household_invitations as invitation set status = 'expired', updated_at = now()
  where invitation.household_id = p_household_id and invitation.status = 'pending' and invitation.expires_at <= now();
  if (select count(*) from public.household_members as membership where membership.household_id = p_household_id) >= 2 then
    raise exception using errcode = 'P0001', message = 'household_member_limit';
  end if;
  if exists (
    select 1 from public.household_members as membership
    join auth.users as existing_user on existing_user.id = membership.user_id
    where membership.household_id = p_household_id
      and private.awn_normalize_email(existing_user.email) = v_email
  ) then raise exception using errcode = 'P0001', message = 'already_household_member'; end if;
  if exists (
    select 1 from public.household_invitations as invitation
    where invitation.household_id = p_household_id and invitation.invited_email = v_email and invitation.status = 'pending'
  ) then raise exception using errcode = 'P0001', message = 'duplicate_pending_invitation'; end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.household_invitations (
    household_id, invited_email, token_hash, expires_at, created_by_user_id
  ) values (
    p_household_id, v_email, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '7 days', v_user_id
  ) returning * into v_invitation;
  return query select v_invitation.id, v_invitation.invited_email, v_invitation.status,
    v_invitation.expires_at, v_token;
end;
$$;

-- Re-copying rotates the bearer token; only the hash remains stored.
create function public.awn_refresh_household_invitation(p_invitation_id uuid)
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
  select * into v_invitation from public.household_invitations as invitation
  where invitation.id = p_invitation_id for update;
  if not found or not private.awn_is_household_owner(v_invitation.household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_owner_required';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'invitation_not_pending';
  end if;
  v_token := encode(gen_random_bytes(32), 'hex');
  update public.household_invitations as invitation
  set token_hash = encode(digest(v_token, 'sha256'), 'hex'), updated_at = now()
  where invitation.id = p_invitation_id
  returning * into v_invitation;
  return query select v_invitation.id, v_invitation.invited_email, v_invitation.expires_at, v_token;
end;
$$;

create function public.awn_get_household_invitation_preview(p_invitation_token text)
returns table (
  household_name text,
  invited_by text,
  invitation_status text,
  expires_at timestamptz,
  is_authenticated boolean,
  email_matches boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash text := encode(digest(coalesce(p_invitation_token, ''), 'sha256'), 'hex');
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
  where invitation.token_hash = v_hash
  limit 1;
end;
$$;

create function public.awn_accept_household_invitation(p_invitation_token text)
returns table (household_id uuid, household_name text, onboarding_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_hash text := encode(digest(coalesce(p_invitation_token, ''), 'sha256'), 'hex');
  v_invitation public.household_invitations%rowtype;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  perform private.awn_ensure_personal_household(v_user_id);
  select private.awn_normalize_email(existing_user.email) into v_user_email
  from auth.users as existing_user where existing_user.id = v_user_id;
  select * into v_invitation from public.household_invitations as invitation
  where invitation.token_hash = v_hash for update;
  if not found then raise exception using errcode = 'P0001', message = 'invitation_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_invitation.household_id::text, 0));
  if v_user_email <> v_invitation.invited_email then raise exception using errcode = '42501', message = 'invitation_email_mismatch'; end if;

  if v_invitation.status = 'accepted' and exists (
    select 1 from public.household_members as membership
    where membership.household_id = v_invitation.household_id and membership.user_id = v_user_id
  ) then
    insert into public.user_preferences (user_id, active_household_id) values (v_user_id, v_invitation.household_id)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  else
    if v_invitation.status <> 'pending' then raise exception using errcode = 'P0001', message = 'invitation_not_pending'; end if;
    if v_invitation.expires_at <= now() then
      update public.household_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
      raise exception using errcode = 'P0001', message = 'invitation_expired';
    end if;
    if (select count(*) from public.household_members as membership where membership.household_id = v_invitation.household_id) >= 2 then
      raise exception using errcode = 'P0001', message = 'household_member_limit';
    end if;
    insert into public.household_members (household_id, user_id, role)
    values (v_invitation.household_id, v_user_id, 'member')
    on conflict (household_id, user_id) do nothing;
    update public.household_invitations set status = 'accepted', accepted_by_user_id = v_user_id, updated_at = now()
    where id = v_invitation.id;
    insert into public.user_preferences (user_id, active_household_id) values (v_user_id, v_invitation.household_id)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  end if;

  return query
  select household.id, household.name, profile.onboarding_completed
  from public.households as household
  join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_invitation.household_id;
end;
$$;

create function public.awn_decline_household_invitation(p_invitation_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_hash text := encode(digest(coalesce(p_invitation_token, ''), 'sha256'), 'hex');
  v_invitation public.household_invitations%rowtype;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  select private.awn_normalize_email(existing_user.email) into v_user_email from auth.users as existing_user where existing_user.id = v_user_id;
  select * into v_invitation from public.household_invitations as invitation where invitation.token_hash = v_hash for update;
  if not found then raise exception using errcode = 'P0001', message = 'invitation_not_found'; end if;
  if v_user_email <> v_invitation.invited_email then raise exception using errcode = '42501', message = 'invitation_email_mismatch'; end if;
  if v_invitation.status <> 'pending' then raise exception using errcode = 'P0001', message = 'invitation_not_pending'; end if;
  if v_invitation.expires_at <= now() then
    update public.household_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    raise exception using errcode = 'P0001', message = 'invitation_expired';
  end if;
  update public.household_invitations set status = 'declined', updated_at = now() where id = v_invitation.id;
  return true;
end;
$$;

create function public.awn_revoke_household_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  select invitation.household_id into v_household_id from public.household_invitations as invitation
  where invitation.id = p_invitation_id for update;
  if v_household_id is null or not private.awn_is_household_owner(v_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_owner_required';
  end if;
  update public.household_invitations set status = 'revoked', updated_at = now()
  where id = p_invitation_id and status = 'pending';
  if not found then raise exception using errcode = 'P0001', message = 'invitation_not_pending'; end if;
  return true;
end;
$$;

create function public.awn_remove_household_member(p_household_id uuid, p_member_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_owner(p_household_id, v_user_id) or p_member_user_id = v_user_id then
    raise exception using errcode = '42501', message = 'household_owner_required';
  end if;
  delete from public.household_members as membership
  where membership.household_id = p_household_id and membership.user_id = p_member_user_id and membership.role = 'member';
  if not found then raise exception using errcode = 'P0001', message = 'household_member_not_found'; end if;
  update public.user_preferences set active_household_id = null, updated_at = now()
  where user_id = p_member_user_id and active_household_id = p_household_id;
  return true;
end;
$$;

create function public.awn_leave_household(p_household_id uuid)
returns table (active_household_id uuid, onboarding_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fallback_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if private.awn_is_household_owner(p_household_id, v_user_id) then
    raise exception using errcode = 'P0001', message = 'owner_transfer_required';
  end if;
  delete from public.household_members as membership
  where membership.household_id = p_household_id and membership.user_id = v_user_id and membership.role = 'member';
  if not found then raise exception using errcode = 'P0001', message = 'household_member_not_found'; end if;
  v_fallback_id := private.awn_fallback_household(v_user_id);
  insert into public.user_preferences (user_id, active_household_id) values (v_user_id, v_fallback_id)
  on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  return query select v_fallback_id, profile.onboarding_completed
    from public.financial_profiles as profile where profile.household_id = v_fallback_id;
end;
$$;

create function public.awn_transfer_household_ownership(p_household_id uuid, p_member_user_id uuid)
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
  return true;
end;
$$;

-- Lightweight snapshot and membership refresh channels.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'financial_profiles') then
      alter publication supabase_realtime add table public.financial_profiles;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_members') then
      alter publication supabase_realtime add table public.household_members;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households') then
      alter publication supabase_realtime add table public.households;
    end if;
  end if;
end;
$$;

alter function private.awn_normalize_email(text) owner to postgres;
alter function private.awn_is_household_owner(uuid, uuid) owner to postgres;
alter function private.awn_fallback_household(uuid) owner to postgres;
alter function public.awn_resolve_active_household(uuid) owner to postgres;
alter function public.awn_resolve_personal_household() owner to postgres;
alter function public.awn_list_households() owner to postgres;
alter function public.awn_list_household_members(uuid) owner to postgres;
alter function public.awn_list_household_invitations(uuid) owner to postgres;
alter function public.awn_create_household_invitation(uuid, text) owner to postgres;
alter function public.awn_refresh_household_invitation(uuid) owner to postgres;
alter function public.awn_get_household_invitation_preview(text) owner to postgres;
alter function public.awn_accept_household_invitation(text) owner to postgres;
alter function public.awn_decline_household_invitation(text) owner to postgres;
alter function public.awn_revoke_household_invitation(uuid) owner to postgres;
alter function public.awn_remove_household_member(uuid, uuid) owner to postgres;
alter function public.awn_leave_household(uuid) owner to postgres;
alter function public.awn_transfer_household_ownership(uuid, uuid) owner to postgres;

revoke all on function private.awn_normalize_email(text) from public, anon, authenticated;
revoke all on function private.awn_is_household_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function private.awn_fallback_household(uuid) from public, anon, authenticated;
revoke all on function public.awn_resolve_active_household(uuid) from public, anon, authenticated;
revoke all on function public.awn_resolve_personal_household() from public, anon, authenticated;
revoke all on function public.awn_list_households() from public, anon, authenticated;
revoke all on function public.awn_list_household_members(uuid) from public, anon, authenticated;
revoke all on function public.awn_list_household_invitations(uuid) from public, anon, authenticated;
revoke all on function public.awn_create_household_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.awn_refresh_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.awn_get_household_invitation_preview(text) from public, anon, authenticated;
revoke all on function public.awn_accept_household_invitation(text) from public, anon, authenticated;
revoke all on function public.awn_decline_household_invitation(text) from public, anon, authenticated;
revoke all on function public.awn_revoke_household_invitation(uuid) from public, anon, authenticated;
revoke all on function public.awn_remove_household_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.awn_leave_household(uuid) from public, anon, authenticated;
revoke all on function public.awn_transfer_household_ownership(uuid, uuid) from public, anon, authenticated;

grant execute on function public.awn_resolve_active_household(uuid) to authenticated;
grant execute on function public.awn_resolve_personal_household() to authenticated;
grant execute on function public.awn_list_households() to authenticated;
grant execute on function public.awn_list_household_members(uuid) to authenticated;
grant execute on function public.awn_list_household_invitations(uuid) to authenticated;
grant execute on function public.awn_create_household_invitation(uuid, text) to authenticated;
grant execute on function public.awn_refresh_household_invitation(uuid) to authenticated;
grant execute on function public.awn_get_household_invitation_preview(text) to anon, authenticated;
grant execute on function public.awn_accept_household_invitation(text) to authenticated;
grant execute on function public.awn_decline_household_invitation(text) to authenticated;
grant execute on function public.awn_revoke_household_invitation(uuid) to authenticated;
grant execute on function public.awn_remove_household_member(uuid, uuid) to authenticated;
grant execute on function public.awn_leave_household(uuid) to authenticated;
grant execute on function public.awn_transfer_household_ownership(uuid, uuid) to authenticated;
