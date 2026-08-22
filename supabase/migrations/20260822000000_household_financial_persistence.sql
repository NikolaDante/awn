-- AWN Phase 3: household-owned, atomic cloud financial persistence.
--
-- financial_profiles.profile_data is the authoritative application snapshot. It stores
-- the complete validated Phase 2 profile so a ledger mutation and every resulting
-- balance/reference change commit in one PostgreSQL row update. The older normalized
-- tables remain available for historical migration compatibility and are moved to the
-- same household RLS boundary; they are not a second application source of truth.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household' check (name = btrim(name) and length(name) between 1 and 160),
  created_by uuid references auth.users(id) on delete set null,
  is_personal boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index households_personal_creator_idx
  on public.households (created_by)
  where is_personal and created_by is not null;

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id, household_id);

alter table public.financial_profiles
  add column household_id uuid references public.households(id) on delete cascade,
  add column created_by_user_id uuid references auth.users(id) on delete set null,
  add column updated_by_user_id uuid references auth.users(id) on delete set null,
  add column country text not null default 'United Arab Emirates',
  add column budget_start_day smallint not null default 1 check (budget_start_day between 1 and 28),
  add column cash_balance_minor bigint not null default 0 check (cash_balance_minor between 0 and 9007199254740991),
  add column profile_data jsonb,
  add column initialized_at timestamptz,
  add column migrated_at timestamptz,
  add column migration_identifier text;

-- Every existing authenticated user receives one idempotent personal household.
insert into public.households (name, created_by, is_personal)
select 'My Household', existing_user.id, true
from auth.users as existing_user
on conflict (created_by) where is_personal and created_by is not null do nothing;

insert into public.household_members (household_id, user_id, role)
select household.id, household.created_by, 'owner'
from public.households as household
where household.is_personal and household.created_by is not null
on conflict (household_id, user_id) do update set role = 'owner';

-- The original ownership triggers require an end-user JWT even for migration backfills.
-- Direct normalized writes are superseded below, so remove those user-owned guards before
-- attaching legacy rows to Households.
drop trigger if exists financial_profiles_assign_user on public.financial_profiles;
drop trigger if exists income_sources_assign_user on public.income_sources;
drop trigger if exists accounts_assign_user on public.accounts;
drop trigger if exists credit_cards_assign_user on public.credit_cards;
drop trigger if exists budget_categories_assign_user on public.budget_categories;
drop trigger if exists savings_goals_assign_user on public.savings_goals;
drop trigger if exists transactions_assign_user on public.transactions;
drop trigger if exists financial_migration_records_assign_user on public.financial_migration_records;

update public.financial_profiles as profile
set household_id = household.id,
    created_by_user_id = coalesce(profile.created_by_user_id, profile.user_id),
    updated_by_user_id = coalesce(profile.updated_by_user_id, profile.user_id)
from public.households as household
where household.created_by = profile.user_id
  and household.is_personal
  and profile.household_id is null;

insert into public.financial_profiles (
  user_id, household_id, created_by_user_id, updated_by_user_id, currency
)
select existing_user.id, household.id, existing_user.id, existing_user.id, 'AED'
from auth.users as existing_user
join public.households as household
  on household.created_by = existing_user.id and household.is_personal
where not exists (
  select 1 from public.financial_profiles as profile where profile.user_id = existing_user.id
);

-- Attach every pre-existing normalized row to its owner's personal household before
-- membership-based RLS replaces the original auth.uid() policies.
alter table public.income_sources add column household_id uuid references public.households(id) on delete cascade;
alter table public.accounts add column household_id uuid references public.households(id) on delete cascade;
alter table public.credit_cards add column household_id uuid references public.households(id) on delete cascade;
alter table public.budget_categories add column household_id uuid references public.households(id) on delete cascade;
alter table public.savings_goals add column household_id uuid references public.households(id) on delete cascade;
alter table public.transactions
  add column household_id uuid references public.households(id) on delete cascade,
  add column created_by_user_id uuid references auth.users(id) on delete set null,
  add column updated_by_user_id uuid references auth.users(id) on delete set null;
alter table public.financial_migration_records add column household_id uuid references public.households(id) on delete cascade;
alter table public.financial_security_events add column household_id uuid references public.households(id) on delete cascade;

update public.income_sources as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.accounts as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.credit_cards as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.budget_categories as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.savings_goals as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.transactions as row
set household_id = profile.household_id,
    created_by_user_id = coalesce(row.created_by_user_id, row.user_id),
    updated_by_user_id = coalesce(row.updated_by_user_id, row.user_id)
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.financial_migration_records as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;
update public.financial_security_events as row set household_id = profile.household_id
from public.financial_profiles as profile where profile.user_id = row.user_id and row.household_id is null;

alter table public.financial_profiles alter column household_id set not null;
alter table public.income_sources alter column household_id set not null;
alter table public.accounts alter column household_id set not null;
alter table public.credit_cards alter column household_id set not null;
alter table public.budget_categories alter column household_id set not null;
alter table public.savings_goals alter column household_id set not null;
alter table public.transactions alter column household_id set not null;
alter table public.financial_migration_records alter column household_id set not null;
alter table public.financial_security_events alter column household_id set not null;

-- The canonical profile identity is now its Household. The legacy user_id remains only
-- for compatibility with the unused Stage 1 normalized RPCs and no longer owns the row.
alter table public.financial_profiles drop constraint financial_profiles_pkey;
alter table public.financial_profiles add constraint financial_profiles_pkey primary key (household_id);
alter table public.financial_profiles alter column user_id drop not null;
alter table public.financial_profiles drop constraint financial_profiles_user_id_fkey;
alter table public.financial_profiles
  add constraint financial_profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

alter table public.financial_profiles drop constraint financial_profiles_currency_check;
alter table public.financial_profiles
  add constraint financial_profiles_currency_check check (currency in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD'));
alter table public.financial_profiles drop constraint financial_profiles_onboarding_step_check;
alter table public.financial_profiles
  add constraint financial_profiles_onboarding_step_check check (onboarding_step between 0 and 6);
alter table public.financial_profiles
  add constraint financial_profiles_profile_data_check check (
    profile_data is null or (
      jsonb_typeof(profile_data) = 'object'
      and profile_data->>'version' = '2'
      and profile_data->>'currency' in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')
      and jsonb_typeof(profile_data->'onboarding') = 'object'
      and jsonb_typeof(profile_data->'incomeSources') = 'array'
      and jsonb_typeof(profile_data->'accounts') = 'array'
      and jsonb_typeof(profile_data->'creditCards') = 'array'
      and jsonb_typeof(profile_data->'categoryBudgets') = 'array'
      and jsonb_typeof(profile_data->'savingsGoals') = 'array'
      and jsonb_typeof(profile_data->'transactions') = 'array'
    ) is true
  );

create index financial_profiles_created_by_idx on public.financial_profiles (created_by_user_id);
create index income_sources_household_idx on public.income_sources (household_id);
create index accounts_household_idx on public.accounts (household_id);
create index credit_cards_household_idx on public.credit_cards (household_id);
create index budget_categories_household_idx on public.budget_categories (household_id);
create index savings_goals_household_idx on public.savings_goals (household_id);
create index transactions_household_date_idx on public.transactions (household_id, transaction_date, created_at, id);

create or replace function private.awn_is_household_member(p_household_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.household_members as membership
    where membership.household_id = p_household_id and membership.user_id = p_user_id
  );
$$;

alter function private.awn_is_household_member(uuid, uuid) owner to postgres;
revoke all on function private.awn_is_household_member(uuid, uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.awn_is_household_member(uuid, uuid) to authenticated;

create or replace function private.awn_ensure_personal_household(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users as existing_user where existing_user.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'invalid_user';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select household.id into v_household_id
  from public.households as household
  where household.created_by = p_user_id and household.is_personal
  limit 1;

  if v_household_id is null then
    insert into public.households (name, created_by, is_personal)
    values ('My Household', p_user_id, true)
    returning id into v_household_id;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, p_user_id, 'owner')
  on conflict (household_id, user_id) do update set role = 'owner';

  if not exists (select 1 from public.financial_profiles as profile where profile.household_id = v_household_id) then
    insert into public.financial_profiles (
      user_id, household_id, created_by_user_id, updated_by_user_id, currency
    ) values (p_user_id, v_household_id, p_user_id, p_user_id, 'AED');
  end if;

  return v_household_id;
end;
$$;

alter function private.awn_ensure_personal_household(uuid) owner to postgres;
revoke all on function private.awn_ensure_personal_household(uuid) from public, anon, authenticated;

-- New auth users receive their personal Household and owner membership without a
-- client-supplied owner ID or any service-role credential in the application.
create or replace function public.awn_create_financial_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.awn_ensure_personal_household(new.id);
  return new;
end;
$$;

alter function public.awn_create_financial_profile_for_auth_user() owner to postgres;
revoke all on function public.awn_create_financial_profile_for_auth_user() from public, anon, authenticated;

-- Replace user-owned policies with membership-owned policies on every durable table.
drop policy if exists "Users select their financial profile" on public.financial_profiles;
drop policy if exists "Users insert their financial profile" on public.financial_profiles;
drop policy if exists "Users update their financial profile" on public.financial_profiles;
drop policy if exists "Users delete their financial profile" on public.financial_profiles;
drop policy if exists "Users select their income sources" on public.income_sources;
drop policy if exists "Users insert their income sources" on public.income_sources;
drop policy if exists "Users update their income sources" on public.income_sources;
drop policy if exists "Users delete their income sources" on public.income_sources;
drop policy if exists "Users select their accounts" on public.accounts;
drop policy if exists "Users insert their accounts" on public.accounts;
drop policy if exists "Users update their accounts" on public.accounts;
drop policy if exists "Users delete their accounts" on public.accounts;
drop policy if exists "Users select their credit cards" on public.credit_cards;
drop policy if exists "Users insert their credit cards" on public.credit_cards;
drop policy if exists "Users update their credit cards" on public.credit_cards;
drop policy if exists "Users delete their credit cards" on public.credit_cards;
drop policy if exists "Users select their budget categories" on public.budget_categories;
drop policy if exists "Users insert their budget categories" on public.budget_categories;
drop policy if exists "Users update their budget categories" on public.budget_categories;
drop policy if exists "Users delete their budget categories" on public.budget_categories;
drop policy if exists "Users select their savings goals" on public.savings_goals;
drop policy if exists "Users insert their savings goals" on public.savings_goals;
drop policy if exists "Users update their savings goals" on public.savings_goals;
drop policy if exists "Users delete their savings goals" on public.savings_goals;
drop policy if exists "Users select their transactions" on public.transactions;
drop policy if exists "Users insert their transactions" on public.transactions;
drop policy if exists "Users update their transactions" on public.transactions;
drop policy if exists "Users delete their transactions" on public.transactions;
drop policy if exists "Users select their migration records" on public.financial_migration_records;
drop policy if exists "Users insert their migration records" on public.financial_migration_records;
drop policy if exists "Users update their migration records" on public.financial_migration_records;
drop policy if exists "Users delete their migration records" on public.financial_migration_records;
drop policy if exists "Users select their security events" on public.financial_security_events;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "Members select their households" on public.households for select to authenticated
  using (private.awn_is_household_member(id));
create policy "Members select household memberships" on public.household_members for select to authenticated
  using (private.awn_is_household_member(household_id));

create policy "Members select household financial profile" on public.financial_profiles for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household income sources" on public.income_sources for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household accounts" on public.accounts for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household credit cards" on public.credit_cards for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household categories" on public.budget_categories for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household savings goals" on public.savings_goals for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household transactions" on public.transactions for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household migration records" on public.financial_migration_records for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select household security events" on public.financial_security_events for select to authenticated
  using (private.awn_is_household_member(household_id));

-- Direct writes stay revoked. These policies describe the future member permission
-- boundary while the atomic profile RPC remains the sole client mutation path.
create policy "Members insert household financial rows" on public.financial_profiles for insert to authenticated
  with check (private.awn_is_household_member(household_id));
create policy "Members update household financial rows" on public.financial_profiles for update to authenticated
  using (private.awn_is_household_member(household_id)) with check (private.awn_is_household_member(household_id));
create policy "Members delete household financial rows" on public.financial_profiles for delete to authenticated
  using (private.awn_is_household_member(household_id));

revoke all on table public.households, public.household_members from public, anon, authenticated;
grant select on table public.households, public.household_members to authenticated;
revoke insert, update, delete on table public.financial_profiles, public.income_sources,
  public.accounts, public.credit_cards, public.budget_categories, public.savings_goals,
  public.transactions, public.financial_migration_records, public.financial_security_events
  from authenticated;

create or replace function public.awn_resolve_personal_household()
returns table (
  household_id uuid,
  household_name text,
  member_role text,
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
  v_household_id := private.awn_ensure_personal_household(v_user_id);

  return query
  select household.id, household.name, membership.role, profile.profile_data,
    profile.revision, profile.initialized_at, profile.migrated_at
  from public.households as household
  join public.household_members as membership
    on membership.household_id = household.id and membership.user_id = v_user_id
  join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_household_id;
end;
$$;

create or replace function private.awn_validate_profile_data(p_profile_data jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_profile_data is null or jsonb_typeof(p_profile_data) is distinct from 'object'
    or p_profile_data->>'version' is distinct from '2'
    or coalesce(p_profile_data->>'currency', '') not in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')
    or jsonb_typeof(p_profile_data->'onboarding') is distinct from 'object'
    or jsonb_typeof(p_profile_data->'incomeSources') is distinct from 'array'
    or jsonb_typeof(p_profile_data->'accounts') is distinct from 'array'
    or jsonb_typeof(coalesce(p_profile_data->'debitCards', '[]'::jsonb)) is distinct from 'array'
    or jsonb_typeof(p_profile_data->'creditCards') is distinct from 'array'
    or jsonb_typeof(p_profile_data->'categoryBudgets') is distinct from 'array'
    or jsonb_typeof(p_profile_data->'savingsGoals') is distinct from 'array'
    or jsonb_typeof(p_profile_data->'transactions') is distinct from 'array'
    or pg_catalog.octet_length(p_profile_data::text) > 5242880 then
    raise exception using errcode = 'P0001', message = 'invalid_financial_profile';
  end if;

  if exists (
    select transaction_data->>'id'
    from jsonb_array_elements(p_profile_data->'transactions') as transaction_data
    group by transaction_data->>'id'
    having transaction_data->>'id' is null or count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'invalid_transaction_identity'; end if;

  if exists (
    select entity_data->>'id'
    from (
      select value as entity_data from jsonb_array_elements(p_profile_data->'incomeSources')
      union all select value from jsonb_array_elements(p_profile_data->'accounts')
      union all select value from jsonb_array_elements(coalesce(p_profile_data->'debitCards', '[]'::jsonb))
      union all select value from jsonb_array_elements(p_profile_data->'creditCards')
      union all select value from jsonb_array_elements(p_profile_data->'categoryBudgets')
      union all select value from jsonb_array_elements(p_profile_data->'savingsGoals')
    ) as entities
    where jsonb_typeof(entity_data) is distinct from 'object' or nullif(entity_data->>'id', '') is null
  ) then raise exception using errcode = 'P0001', message = 'invalid_financial_entity'; end if;

  if exists (
    select account_data
    from jsonb_array_elements(p_profile_data->'accounts') as account_data
    where jsonb_typeof(account_data->'balance') is distinct from 'number'
      or (account_data->>'balance')::numeric < 0
      or (account_data->>'balance')::numeric > 9007199254740991
      or trunc((account_data->>'balance')::numeric) <> (account_data->>'balance')::numeric
  ) or coalesce((p_profile_data->>'cashBalance')::numeric, 0) < 0
    or coalesce((p_profile_data->>'cashBalance')::numeric, 0) > 9007199254740991
    or trunc(coalesce((p_profile_data->>'cashBalance')::numeric, 0)) <> coalesce((p_profile_data->>'cashBalance')::numeric, 0) then
    raise exception using errcode = 'P0001', message = 'invalid_balance';
  end if;

  if exists (
    select card_data
    from jsonb_array_elements(p_profile_data->'creditCards') as card_data
    where jsonb_typeof(card_data->'limit') is distinct from 'number'
      or jsonb_typeof(card_data->'owed') is distinct from 'number'
      or (card_data->>'limit')::numeric <= 0
      or (card_data->>'limit')::numeric > 9007199254740991
      or (card_data->>'owed')::numeric < 0
      or (card_data->>'owed')::numeric > (card_data->>'limit')::numeric
      or trunc((card_data->>'limit')::numeric) <> (card_data->>'limit')::numeric
      or trunc((card_data->>'owed')::numeric) <> (card_data->>'owed')::numeric
  ) then raise exception using errcode = 'P0001', message = 'invalid_credit_card_balance'; end if;

  if exists (
    select link.linked_account_id
    from (
      select debit_data->>'linkedAccountId' as linked_account_id
      from jsonb_array_elements(coalesce(p_profile_data->'debitCards', '[]'::jsonb)) as debit_data
      where debit_data ? 'linkedAccountId' and nullif(debit_data->>'linkedAccountId', '') is not null
    ) as link
    group by link.linked_account_id
    having count(*) > 1 or not exists (
      select 1 from jsonb_array_elements(p_profile_data->'accounts') as account_data
      where account_data->>'id' = link.linked_account_id
    )
  ) then raise exception using errcode = 'P0001', message = 'invalid_debit_account_link'; end if;
end;
$$;

create or replace function public.awn_save_financial_state(
  p_household_id uuid,
  p_expected_revision bigint,
  p_profile_data jsonb,
  p_migration_identifier text default null
)
returns table (
  household_id uuid,
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
  v_profile public.financial_profiles%rowtype;
  v_transaction jsonb;
  v_old_transaction jsonb;
  v_enriched_transaction jsonb;
  v_transactions jsonb := '[]'::jsonb;
  v_profile_data jsonb;
  v_created_by text;
  v_updated_by text;
  v_onboarding_step smallint;
  v_budget_start_day smallint;
  v_cash_balance bigint;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_member(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_access_denied';
  end if;
  if p_expected_revision is null then raise exception using errcode = 'P0001', message = 'revision_required'; end if;
  perform private.awn_validate_profile_data(p_profile_data);

  select * into v_profile from public.financial_profiles as profile
  where profile.household_id = p_household_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'financial_profile_not_found'; end if;
  if v_profile.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;

  -- Server-owned attribution cannot be forged by a client. Existing creator attribution
  -- is retained; changed/new transactions receive the authenticated actor as updater.
  for v_transaction in select value from jsonb_array_elements(p_profile_data->'transactions') loop
    select value into v_old_transaction
    from jsonb_array_elements(coalesce(v_profile.profile_data->'transactions', '[]'::jsonb))
    where value->>'id' = v_transaction->>'id'
    limit 1;

    if v_old_transaction is null then
      v_created_by := v_user_id::text;
      v_updated_by := v_user_id::text;
    else
      v_created_by := coalesce(v_old_transaction->>'createdByUserId', v_profile.created_by_user_id::text, v_user_id::text);
      if (v_transaction - 'createdByUserId' - 'updatedByUserId') is distinct from
         (v_old_transaction - 'createdByUserId' - 'updatedByUserId') then
        v_updated_by := v_user_id::text;
      else
        v_updated_by := coalesce(v_old_transaction->>'updatedByUserId', v_created_by);
      end if;
    end if;

    v_enriched_transaction := (v_transaction - 'createdByUserId' - 'updatedByUserId')
      || jsonb_build_object('createdByUserId', v_created_by, 'updatedByUserId', v_updated_by);
    v_transactions := v_transactions || jsonb_build_array(v_enriched_transaction);
    v_old_transaction := null;
  end loop;

  v_profile_data := jsonb_set(p_profile_data, '{transactions}', v_transactions, false);
  v_onboarding_step := greatest(0, least(6, coalesce((v_profile_data->'onboarding'->>'currentStep')::smallint, 0)));
  v_budget_start_day := greatest(1, least(28, coalesce((v_profile_data->>'budgetStartDay')::smallint, 1)));
  v_cash_balance := greatest(0, coalesce((v_profile_data->>'cashBalance')::bigint, 0));

  update public.financial_profiles as profile
  set profile_data = v_profile_data,
      currency = v_profile_data->>'currency',
      country = coalesce(nullif(btrim(v_profile_data->>'country'), ''), 'United Arab Emirates'),
      budget_start_day = v_budget_start_day,
      cash_balance_minor = v_cash_balance,
      onboarding_step = v_onboarding_step,
      onboarding_completed = coalesce((v_profile_data->'onboarding'->>'completed')::boolean, false),
      initialized_at = coalesce(profile.initialized_at, now()),
      migrated_at = case when p_migration_identifier is null then profile.migrated_at else coalesce(profile.migrated_at, now()) end,
      migration_identifier = coalesce(profile.migration_identifier, nullif(btrim(p_migration_identifier), '')),
      updated_by_user_id = v_user_id,
      revision = profile.revision + 1,
      updated_at = now()
  where profile.household_id = p_household_id and profile.revision = p_expected_revision
  returning profile.* into v_profile;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;

  if p_migration_identifier is not null then
    insert into public.financial_migration_records (
      user_id, household_id, migration_identifier, status, imported_at
    ) values (v_user_id, p_household_id, btrim(p_migration_identifier), 'completed', now())
    on conflict (user_id, migration_identifier) do update
      set status = 'completed', imported_at = coalesce(public.financial_migration_records.imported_at, excluded.imported_at),
          household_id = excluded.household_id, updated_at = now();
  end if;

  return query select v_profile.household_id, v_profile.profile_data, v_profile.revision,
    v_profile.initialized_at, v_profile.migrated_at;
end;
$$;

alter function public.awn_resolve_personal_household() owner to postgres;
alter function private.awn_validate_profile_data(jsonb) owner to postgres;
alter function public.awn_save_financial_state(uuid, bigint, jsonb, text) owner to postgres;

revoke all on function public.awn_resolve_personal_household() from public, anon, authenticated;
revoke all on function public.awn_save_financial_state(uuid, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function private.awn_validate_profile_data(jsonb) from public, anon, authenticated;
grant execute on function public.awn_resolve_personal_household() to authenticated;
grant execute on function public.awn_save_financial_state(uuid, bigint, jsonb, text) to authenticated;

-- Stage 1 user-owned mutation RPCs are superseded by the atomic Household profile RPC.
-- Revoking their authenticated execution prevents any path from bypassing Household RLS.
revoke execute on all functions in schema public from authenticated;
grant execute on function public.awn_resolve_personal_household() to authenticated;
grant execute on function public.awn_save_financial_state(uuid, bigint, jsonb, text) to authenticated;
