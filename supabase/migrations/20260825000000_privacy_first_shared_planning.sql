-- AWN Phase 4 privacy rework: private finances and collaborative planning.
--
-- Private financial ownership is immutable and follows households.created_by.
-- Household membership grants access only to the planning tables introduced here.
-- user_preferences.active_household_id is retained for compatibility, but is no
-- longer a financial authorization or routing input.

create or replace function private.awn_is_private_financial_owner(
  p_household_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.households as household
    where household.id = p_household_id and household.created_by = p_user_id
  );
$$;

create or replace function private.awn_private_household_id(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_household_id uuid;
begin
  select household.id into v_household_id
  from public.households as household
  join public.financial_profiles as profile on profile.household_id = household.id
  where household.created_by = p_user_id
  order by household.created_at, household.id
  limit 1;

  if v_household_id is null then
    v_household_id := private.awn_ensure_personal_household(p_user_id);
  end if;
  return v_household_id;
end;
$$;

-- Replace the member-readable Phase 4A policies with creator-only private policies.
drop policy if exists "Members select household financial profile" on public.financial_profiles;
drop policy if exists "Members select household income sources" on public.income_sources;
drop policy if exists "Members select household accounts" on public.accounts;
drop policy if exists "Members select household credit cards" on public.credit_cards;
drop policy if exists "Members select household categories" on public.budget_categories;
drop policy if exists "Members select household savings goals" on public.savings_goals;
drop policy if exists "Members select household transactions" on public.transactions;
drop policy if exists "Members select household migration records" on public.financial_migration_records;
drop policy if exists "Members select household security events" on public.financial_security_events;
drop policy if exists "Members select household import fingerprints" on public.financial_import_fingerprints;
drop policy if exists "Members insert household financial rows" on public.financial_profiles;
drop policy if exists "Members update household financial rows" on public.financial_profiles;
drop policy if exists "Members delete household financial rows" on public.financial_profiles;

create policy "Owners select private financial profile" on public.financial_profiles
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private income sources" on public.income_sources
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private accounts" on public.accounts
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private credit cards" on public.credit_cards
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private categories" on public.budget_categories
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private savings goals" on public.savings_goals
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private transactions" on public.transactions
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private migration records" on public.financial_migration_records
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private security events" on public.financial_security_events
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));
create policy "Owners select private import fingerprints" on public.financial_import_fingerprints
  for select to authenticated using (private.awn_is_private_financial_owner(household_id));

create table public.shared_plan_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  shared_plan_name text not null check (shared_plan_name = btrim(shared_plan_name) and length(shared_plan_name) between 1 and 60),
  currency text not null check (currency in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')),
  budget_start_day smallint not null check (budget_start_day between 1 and 28),
  revision bigint not null default 0 check (revision >= 0),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shared_monthly_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  overall_budget_minor bigint not null check (overall_budget_minor between 1 and 9007199254740991),
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, period_key)
);

create table public.shared_budget_allocations (
  household_id uuid not null,
  period_key text not null,
  category text not null check (category = btrim(category) and length(category) between 1 and 60),
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, period_key, category),
  foreign key (household_id, period_key) references public.shared_monthly_budgets(household_id, period_key) on delete cascade
);

create table public.shared_budget_contributions (
  source_private_household_id uuid not null references public.households(id) on delete cascade,
  source_private_transaction_id text not null check (length(source_private_transaction_id) between 1 and 160),
  household_id uuid not null references public.households(id) on delete cascade,
  contributed_by_user_id uuid not null references auth.users(id) on delete cascade,
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  category text not null check (category = btrim(category) and length(category) between 1 and 60),
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_private_household_id, source_private_transaction_id)
);
create index shared_budget_contributions_aggregate_idx
  on public.shared_budget_contributions (household_id, period_key, category);

create table public.shared_savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 80),
  target_minor bigint not null check (target_minor between 1 and 9007199254740991),
  planned_contribution_minor bigint not null default 0 check (planned_contribution_minor between 0 and 9007199254740991),
  target_date date,
  priority smallint not null default 1 check (priority between 1 and 99),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shared_savings_goals_household_idx on public.shared_savings_goals (household_id, priority, created_at);

create table public.shared_savings_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.shared_savings_goals(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index shared_savings_contributions_goal_idx on public.shared_savings_contributions (goal_id, created_at);

alter table public.shared_plan_settings enable row level security;
alter table public.shared_monthly_budgets enable row level security;
alter table public.shared_budget_allocations enable row level security;
alter table public.shared_budget_contributions enable row level security;
alter table public.shared_savings_goals enable row level security;
alter table public.shared_savings_contributions enable row level security;

create policy "Members select shared plan settings" on public.shared_plan_settings for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select shared monthly budgets" on public.shared_monthly_budgets for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select shared budget allocations" on public.shared_budget_allocations for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Contributors select only own private mappings" on public.shared_budget_contributions for select to authenticated
  using (contributed_by_user_id = auth.uid() and private.awn_is_private_financial_owner(source_private_household_id));
create policy "Members select shared savings goals" on public.shared_savings_goals for select to authenticated
  using (private.awn_is_household_member(household_id));
create policy "Members select shared savings contributions" on public.shared_savings_contributions for select to authenticated
  using (private.awn_is_household_member(household_id));

revoke all on table public.shared_plan_settings, public.shared_monthly_budgets,
  public.shared_budget_allocations, public.shared_budget_contributions,
  public.shared_savings_goals, public.shared_savings_contributions from public, anon, authenticated;
grant select on table public.shared_plan_settings, public.shared_monthly_budgets,
  public.shared_budget_allocations, public.shared_savings_goals,
  public.shared_savings_contributions to authenticated;
grant select on table public.shared_budget_contributions to authenticated;

create or replace function private.awn_shared_period_key(p_date date, p_start_day smallint)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select to_char(
    case when extract(day from p_date)::int < p_start_day
      then date_trunc('month', p_date)::date - interval '1 month'
      else date_trunc('month', p_date)::date
    end,
    'YYYY-MM'
  );
$$;

create or replace function private.awn_shared_relationship_id(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_household_id uuid;
begin
  select household.id into v_household_id
  from public.household_members as membership
  join public.households as household on household.id = membership.household_id
  where membership.user_id = p_user_id
  order by
    (select count(*) from public.household_members as counted where counted.household_id = household.id) desc,
    exists (select 1 from public.household_invitations as invitation where invitation.household_id = household.id and invitation.status = 'pending' and invitation.expires_at > now()) desc,
    (household.created_by = p_user_id) desc,
    household.created_at,
    household.id
  limit 1;
  if v_household_id is null then v_household_id := private.awn_private_household_id(p_user_id); end if;
  return v_household_id;
end;
$$;

create or replace function private.awn_ensure_shared_plan_settings(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_profile public.financial_profiles%rowtype; v_creator_id uuid;
begin
  if not private.awn_is_household_member(p_household_id, p_user_id) then
    raise exception using errcode = '42501', message = 'household_access_denied';
  end if;
  select household.created_by into v_creator_id from public.households as household where household.id = p_household_id;
  select profile.* into v_profile from public.financial_profiles as profile
  join public.households as private_household on private_household.id = profile.household_id
  where private_household.created_by = v_creator_id
  order by private_household.created_at limit 1;

  insert into public.shared_plan_settings (
    household_id, shared_plan_name, currency, budget_start_day,
    created_by_user_id, updated_by_user_id
  )
  select household.id, household.name,
    coalesce(v_profile.currency, 'AED'), coalesce(v_profile.budget_start_day, 1),
    p_user_id, p_user_id
  from public.households as household where household.id = p_household_id
  on conflict (household_id) do nothing;
end;
$$;

create or replace function private.awn_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(preference.display_name, ''), nullif(split_part(account.email, '@', 1), ''), 'Member')
  from auth.users as account
  left join public.user_preferences as preference on preference.user_id = account.id
  where account.id = p_user_id;
$$;

create or replace function public.awn_resolve_private_household()
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
declare v_user_id uuid := auth.uid(); v_household_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  v_household_id := private.awn_private_household_id(v_user_id);
  return query
  select household.id, household.name, 'owner'::text, 1::bigint, true,
    profile.profile_data, profile.revision, profile.initialized_at, profile.migrated_at
  from public.households as household
  join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_household_id and household.created_by = v_user_id;
end;
$$;

-- Compatibility only: active_household_id and requested IDs cannot change private context.
create or replace function public.awn_resolve_active_household(p_requested_household_id uuid default null)
returns table (
  household_id uuid, household_name text, member_role text, member_count bigint,
  is_personal boolean, profile_data jsonb, revision bigint,
  initialized_at timestamptz, migrated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$ select * from public.awn_resolve_private_household(); $$;

drop function if exists public.awn_resolve_personal_household();
create function public.awn_resolve_personal_household()
returns table (
  household_id uuid, household_name text, member_role text, member_count bigint,
  profile_data jsonb, revision bigint, initialized_at timestamptz, migrated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select household_id, household_name, member_role, member_count, profile_data,
    revision, initialized_at, migrated_at from public.awn_resolve_private_household();
$$;

create or replace function public.awn_get_shared_plan()
returns table (
  household_id uuid, shared_plan_name text, member_role text, member_count bigint,
  currency text, budget_start_day smallint, revision bigint, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_household_id uuid;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  perform private.awn_ensure_personal_household(v_user_id);
  v_household_id := private.awn_shared_relationship_id(v_user_id);
  perform private.awn_ensure_shared_plan_settings(v_household_id, v_user_id);
  return query
  select settings.household_id, settings.shared_plan_name, membership.role,
    (select count(*) from public.household_members as counted where counted.household_id = settings.household_id),
    settings.currency, settings.budget_start_day, settings.revision, settings.updated_at
  from public.shared_plan_settings as settings
  join public.household_members as membership on membership.household_id = settings.household_id and membership.user_id = v_user_id
  where settings.household_id = v_household_id;
end;
$$;

create or replace function public.awn_update_shared_plan_settings(
  p_household_id uuid, p_name text, p_currency text, p_budget_start_day smallint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_name text := btrim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_member(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  if length(v_name) not between 1 and 60 or p_currency not in ('AED','USD','EUR','GBP','SAR','RSD') or p_budget_start_day not between 1 and 28 then
    raise exception using errcode = 'P0001', message = 'invalid_shared_plan_settings';
  end if;
  perform private.awn_ensure_shared_plan_settings(p_household_id, v_user_id);
  update public.shared_plan_settings set shared_plan_name = v_name, currency = p_currency,
    budget_start_day = p_budget_start_day, updated_by_user_id = v_user_id,
    revision = revision + 1, updated_at = now() where household_id = p_household_id;
  return true;
end;
$$;

create or replace function public.awn_save_shared_budget(
  p_household_id uuid, p_period_key text, p_overall_budget_minor bigint, p_allocations jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_member(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  if p_period_key !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_overall_budget_minor not between 1 and 9007199254740991
    or jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_shared_budget';
  end if;
  if exists (
    select item->>'category' from jsonb_array_elements(p_allocations) as item
    group by item->>'category' having nullif(btrim(item->>'category'), '') is null or count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_allocations) as item
    where length(btrim(item->>'category')) > 60 or jsonb_typeof(item->'amount') is distinct from 'number'
      or (item->>'amount')::numeric <= 0 or trunc((item->>'amount')::numeric) <> (item->>'amount')::numeric
      or (item->>'amount')::numeric > 9007199254740991
  ) then raise exception using errcode = 'P0001', message = 'invalid_shared_budget'; end if;

  perform private.awn_ensure_shared_plan_settings(p_household_id, v_user_id);
  insert into public.shared_monthly_budgets (household_id, period_key, overall_budget_minor, updated_by_user_id)
  values (p_household_id, p_period_key, p_overall_budget_minor, v_user_id)
  on conflict (household_id, period_key) do update set overall_budget_minor = excluded.overall_budget_minor,
    updated_by_user_id = excluded.updated_by_user_id, updated_at = now();
  delete from public.shared_budget_allocations where household_id = p_household_id and period_key = p_period_key;
  insert into public.shared_budget_allocations (household_id, period_key, category, amount_minor, updated_by_user_id)
  select p_household_id, p_period_key, btrim(item->>'category'), (item->>'amount')::bigint, v_user_id
  from jsonb_array_elements(p_allocations) as item;
  update public.shared_plan_settings set updated_by_user_id = v_user_id, revision = revision + 1, updated_at = now()
  where household_id = p_household_id;
  return true;
end;
$$;

create or replace function public.awn_get_shared_budget_summary(p_household_id uuid, p_period_key text)
returns table (
  period_key text, overall_budget_minor bigint, total_spent_minor bigint,
  category text, allocated_minor bigint, spent_minor bigint,
  updated_by_name text, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.awn_is_household_member(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_access_denied';
  end if;
  return query
  with categories as (
    select allocation.category from public.shared_budget_allocations as allocation
    where allocation.household_id = p_household_id and allocation.period_key = p_period_key
    union
    select contribution.category from public.shared_budget_contributions as contribution
    where contribution.household_id = p_household_id and contribution.period_key = p_period_key
  ), totals as (
    select coalesce(sum(contribution.amount_minor), 0)::bigint as spent
    from public.shared_budget_contributions as contribution
    where contribution.household_id = p_household_id and contribution.period_key = p_period_key
  )
  select p_period_key, budget.overall_budget_minor, totals.spent,
    categories.category, coalesce(allocation.amount_minor, 0)::bigint,
    coalesce((select sum(contribution.amount_minor) from public.shared_budget_contributions as contribution
      where contribution.household_id = p_household_id and contribution.period_key = p_period_key and contribution.category = categories.category), 0)::bigint,
    private.awn_display_name(budget.updated_by_user_id), budget.updated_at
  from totals
  left join public.shared_monthly_budgets as budget on budget.household_id = p_household_id and budget.period_key = p_period_key
  left join categories on true
  left join public.shared_budget_allocations as allocation on allocation.household_id = p_household_id
    and allocation.period_key = p_period_key and allocation.category = categories.category;
end;
$$;

create or replace function private.awn_sync_shared_budget_contributions(
  p_private_household_id uuid, p_user_id uuid, p_profile_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_affected uuid[]; v_transaction jsonb; v_shared_id uuid; v_settings public.shared_plan_settings%rowtype;
begin
  select coalesce(array_agg(distinct contribution.household_id), '{}'::uuid[]) into v_affected
  from public.shared_budget_contributions as contribution
  where contribution.source_private_household_id = p_private_household_id and contribution.contributed_by_user_id = p_user_id;

  delete from public.shared_budget_contributions
  where source_private_household_id = p_private_household_id and contributed_by_user_id = p_user_id;

  for v_transaction in select value from jsonb_array_elements(coalesce(p_profile_data->'transactions', '[]'::jsonb)) loop
    if v_transaction->>'type' = 'expense'
      and coalesce((v_transaction->'householdBudget'->>'included')::boolean, false)
      and nullif(v_transaction->'householdBudget'->>'householdId', '') is not null then
      v_shared_id := (v_transaction->'householdBudget'->>'householdId')::uuid;
      if private.awn_is_household_member(v_shared_id, p_user_id) then
        perform private.awn_ensure_shared_plan_settings(v_shared_id, p_user_id);
        select * into v_settings from public.shared_plan_settings where household_id = v_shared_id;
        insert into public.shared_budget_contributions (
          source_private_household_id, source_private_transaction_id, household_id,
          contributed_by_user_id, period_key, category, amount_minor
        ) values (
          p_private_household_id, v_transaction->>'id', v_shared_id, p_user_id,
          private.awn_shared_period_key((v_transaction->>'date')::date, v_settings.budget_start_day),
          left(btrim(coalesce(nullif(v_transaction->'householdBudget'->>'category', ''), nullif(v_transaction->>'category', ''), 'Unbudgeted')), 60),
          (v_transaction->>'amount')::bigint
        );
        if not v_shared_id = any(v_affected) then v_affected := array_append(v_affected, v_shared_id); end if;
      end if;
    end if;
  end loop;

  update public.shared_plan_settings set revision = revision + 1, updated_at = now()
  where household_id = any(v_affected);
end;
$$;

create or replace function private.awn_remove_departing_member_contributions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shared_budget_contributions as contribution
  where contribution.household_id = old.household_id and contribution.contributed_by_user_id = old.user_id;
  update public.shared_plan_settings set revision = revision + 1, updated_at = now()
  where household_id = old.household_id;
  return old;
end; $$;

create trigger shared_planning_member_departure
after delete on public.household_members
for each row execute function private.awn_remove_departing_member_contributions();

create or replace function public.awn_save_shared_savings_goal(
  p_household_id uuid, p_goal_id uuid, p_name text, p_target_minor bigint,
  p_planned_contribution_minor bigint, p_target_date date, p_priority smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_goal_id uuid := coalesce(p_goal_id, gen_random_uuid());
begin
  if v_user_id is null or not private.awn_is_household_member(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  if length(btrim(coalesce(p_name,''))) not between 1 and 80 or p_target_minor not between 1 and 9007199254740991
    or p_planned_contribution_minor not between 0 and 9007199254740991 or p_priority not between 1 and 99 then
    raise exception using errcode = 'P0001', message = 'invalid_shared_savings_goal';
  end if;
  perform private.awn_ensure_shared_plan_settings(p_household_id, v_user_id);
  insert into public.shared_savings_goals (id, household_id, name, target_minor, planned_contribution_minor, target_date, priority, created_by_user_id, updated_by_user_id)
  values (v_goal_id, p_household_id, btrim(p_name), p_target_minor, p_planned_contribution_minor, p_target_date, p_priority, v_user_id, v_user_id)
  on conflict (id) do update set name = excluded.name, target_minor = excluded.target_minor,
    planned_contribution_minor = excluded.planned_contribution_minor, target_date = excluded.target_date,
    priority = excluded.priority, updated_by_user_id = v_user_id, updated_at = now()
  where public.shared_savings_goals.household_id = p_household_id;
  if not found then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  update public.shared_plan_settings set updated_by_user_id = v_user_id, revision = revision + 1, updated_at = now() where household_id = p_household_id;
  return v_goal_id;
end;
$$;

create or replace function public.awn_delete_shared_savings_goal(p_household_id uuid, p_goal_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.awn_is_household_member(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  delete from public.shared_savings_goals where id = p_goal_id and household_id = p_household_id;
  update public.shared_plan_settings set updated_by_user_id = v_user_id, revision = revision + 1, updated_at = now() where household_id = p_household_id;
  return found;
end; $$;

create or replace function public.awn_add_shared_savings_contribution(p_household_id uuid, p_goal_id uuid, p_amount_minor bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_id uuid;
begin
  if v_user_id is null or not private.awn_is_household_member(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  if p_amount_minor not between 1 and 9007199254740991 or not exists (select 1 from public.shared_savings_goals where id = p_goal_id and household_id = p_household_id) then raise exception using errcode = 'P0001', message = 'invalid_shared_savings_contribution'; end if;
  insert into public.shared_savings_contributions (goal_id, household_id, amount_minor, created_by_user_id)
  values (p_goal_id, p_household_id, p_amount_minor, v_user_id) returning id into v_id;
  update public.shared_plan_settings set updated_by_user_id = v_user_id, revision = revision + 1, updated_at = now() where household_id = p_household_id;
  return v_id;
end; $$;

create or replace function public.awn_get_shared_savings_goals(p_household_id uuid)
returns table (
  goal_id uuid, name text, target_minor bigint, saved_minor bigint,
  planned_contribution_minor bigint, target_date date, priority smallint,
  updated_by_name text, updated_at timestamptz,
  latest_contribution_minor bigint, latest_contribution_by text, latest_contribution_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.awn_is_household_member(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  return query
  select goal.id, goal.name, goal.target_minor, coalesce(sum(contribution.amount_minor),0)::bigint,
    goal.planned_contribution_minor, goal.target_date, goal.priority,
    private.awn_display_name(goal.updated_by_user_id), goal.updated_at,
    latest.amount_minor, private.awn_display_name(latest.created_by_user_id), latest.created_at
  from public.shared_savings_goals as goal
  left join public.shared_savings_contributions as contribution on contribution.goal_id = goal.id
  left join lateral (
    select recent.amount_minor, recent.created_by_user_id, recent.created_at
    from public.shared_savings_contributions as recent where recent.goal_id = goal.id
    order by recent.created_at desc, recent.id desc limit 1
  ) as latest on true
  where goal.household_id = p_household_id
  group by goal.id, latest.amount_minor, latest.created_by_user_id, latest.created_at
  order by goal.priority, goal.created_at;
end; $$;

create or replace function public.awn_get_household_invitation_preview(p_invitation_token text)
returns table (
  household_name text, invited_by text, invitation_status text, expires_at timestamptz,
  is_authenticated boolean, email_matches boolean
)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_hash text:=encode(extensions.digest(coalesce(p_invitation_token,''),'sha256'),'hex');
begin
  return query
  select coalesce(settings.shared_plan_name,household.name),
    coalesce(nullif(preferences.display_name,''),nullif(split_part(inviter.email,'@',1),''),'An AWN member'),
    case when invitation.status='pending' and invitation.expires_at<=now() then 'expired' else invitation.status end,
    invitation.expires_at,v_user_id is not null,
    v_user_id is not null and private.awn_normalize_email(current_user_record.email)=invitation.invited_email
  from public.household_invitations as invitation
  join public.households as household on household.id=invitation.household_id
  left join public.shared_plan_settings as settings on settings.household_id=household.id
  join auth.users as inviter on inviter.id=invitation.created_by_user_id
  left join public.user_preferences as preferences on preferences.user_id=inviter.id
  left join auth.users as current_user_record on current_user_record.id=v_user_id
  where invitation.token_hash=v_hash limit 1;
end; $$;

create or replace function public.awn_accept_household_invitation(p_invitation_token text)
returns table (household_id uuid, household_name text, onboarding_completed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid:=auth.uid(); v_user_email text;
  v_hash text:=encode(extensions.digest(coalesce(p_invitation_token,''),'sha256'),'hex');
  v_invitation public.household_invitations%rowtype; v_private_id uuid;
begin
  if v_user_id is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  v_private_id:=private.awn_private_household_id(v_user_id);
  select private.awn_normalize_email(existing_user.email) into v_user_email from auth.users as existing_user where existing_user.id=v_user_id;
  select * into v_invitation from public.household_invitations as invitation where invitation.token_hash=v_hash for update;
  if not found then raise exception using errcode='P0001',message='invitation_not_found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_invitation.household_id::text,0));
  if v_user_email<>v_invitation.invited_email then raise exception using errcode='42501',message='invitation_email_mismatch'; end if;
  if v_invitation.status='accepted' and exists(select 1 from public.household_members as membership where membership.household_id=v_invitation.household_id and membership.user_id=v_user_id) then null;
  else
    if v_invitation.status<>'pending' then raise exception using errcode='P0001',message='invitation_not_pending'; end if;
    if v_invitation.expires_at<=now() then raise exception using errcode='P0001',message='invitation_expired'; end if;
    if (select count(*) from public.household_members as membership where membership.household_id=v_invitation.household_id)>=2 then raise exception using errcode='P0001',message='household_member_limit'; end if;
    insert into public.household_members(household_id,user_id,role) values(v_invitation.household_id,v_user_id,'member') on conflict on constraint household_members_pkey do nothing;
    update public.household_invitations set status='accepted',accepted_by_user_id=v_user_id,updated_at=now() where id=v_invitation.id;
  end if;
  perform private.awn_ensure_shared_plan_settings(v_invitation.household_id,v_invitation.created_by_user_id);
  return query select household.id,coalesce(settings.shared_plan_name,household.name),profile.onboarding_completed
  from public.households as household
  join public.shared_plan_settings as settings on settings.household_id=household.id
  join public.financial_profiles as profile on profile.household_id=v_private_id
  where household.id=v_invitation.household_id;
end; $$;

-- Private save RPC, with server-owned attribution and atomic shared aggregate sync.
create or replace function public.awn_save_financial_state(
  p_household_id uuid, p_expected_revision bigint, p_profile_data jsonb,
  p_migration_identifier text default null
)
returns table (household_id uuid, profile_data jsonb, revision bigint, initialized_at timestamptz, migrated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_profile public.financial_profiles%rowtype;
  v_transaction jsonb; v_old_transaction jsonb; v_enriched_transaction jsonb;
  v_transactions jsonb := '[]'::jsonb; v_profile_data jsonb;
  v_created_by text; v_updated_by text; v_onboarding_step smallint;
  v_budget_start_day smallint; v_cash_balance bigint;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_private_financial_owner(p_household_id, v_user_id) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  if p_expected_revision is null then raise exception using errcode = 'P0001', message = 'revision_required'; end if;
  perform private.awn_validate_profile_data(p_profile_data);
  select * into v_profile from public.financial_profiles as profile where profile.household_id = p_household_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'financial_profile_not_found'; end if;
  if v_profile.revision is distinct from p_expected_revision then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;

  for v_transaction in select value from jsonb_array_elements(p_profile_data->'transactions') loop
    select value into v_old_transaction from jsonb_array_elements(coalesce(v_profile.profile_data->'transactions','[]'::jsonb))
      where value->>'id' = v_transaction->>'id' limit 1;
    if v_old_transaction is null then v_created_by := v_user_id::text; v_updated_by := v_user_id::text;
    else
      v_created_by := coalesce(v_old_transaction->>'createdByUserId', v_profile.created_by_user_id::text, v_user_id::text);
      if (v_transaction - 'createdByUserId' - 'updatedByUserId') is distinct from (v_old_transaction - 'createdByUserId' - 'updatedByUserId')
        then v_updated_by := v_user_id::text;
        else v_updated_by := coalesce(v_old_transaction->>'updatedByUserId', v_created_by); end if;
    end if;
    v_enriched_transaction := (v_transaction - 'createdByUserId' - 'updatedByUserId') || jsonb_build_object('createdByUserId',v_created_by,'updatedByUserId',v_updated_by);
    v_transactions := v_transactions || jsonb_build_array(v_enriched_transaction); v_old_transaction := null;
  end loop;
  v_profile_data := jsonb_set(p_profile_data, '{transactions}', v_transactions, false);
  v_onboarding_step := greatest(0, least(6, coalesce((v_profile_data->'onboarding'->>'currentStep')::smallint,0)));
  v_budget_start_day := greatest(1, least(28, coalesce((v_profile_data->>'budgetStartDay')::smallint,1)));
  v_cash_balance := greatest(0, coalesce((v_profile_data->>'cashBalance')::bigint,0));
  update public.financial_profiles as profile set profile_data=v_profile_data, currency=v_profile_data->>'currency',
    country=coalesce(nullif(btrim(v_profile_data->>'country'),''),'United Arab Emirates'), budget_start_day=v_budget_start_day,
    cash_balance_minor=v_cash_balance, onboarding_step=v_onboarding_step,
    onboarding_completed=coalesce((v_profile_data->'onboarding'->>'completed')::boolean,false), initialized_at=coalesce(profile.initialized_at,now()),
    migrated_at=case when p_migration_identifier is null then profile.migrated_at else coalesce(profile.migrated_at,now()) end,
    migration_identifier=coalesce(profile.migration_identifier,nullif(btrim(p_migration_identifier),'')), updated_by_user_id=v_user_id,
    revision=profile.revision+1, updated_at=now()
  where profile.household_id=p_household_id and profile.revision=p_expected_revision returning profile.* into v_profile;
  if not found then raise exception using errcode='P0001', message='revision_conflict'; end if;
  perform private.awn_sync_shared_budget_contributions(p_household_id, v_user_id, v_profile_data);
  if p_migration_identifier is not null then
    insert into public.financial_migration_records(user_id,household_id,migration_identifier,status,imported_at)
    values(v_user_id,p_household_id,btrim(p_migration_identifier),'completed',now())
    on conflict(user_id,migration_identifier) do update set status='completed', imported_at=coalesce(public.financial_migration_records.imported_at,excluded.imported_at), household_id=excluded.household_id, updated_at=now();
  end if;
  return query select v_profile.household_id,v_profile.profile_data,v_profile.revision,v_profile.initialized_at,v_profile.migrated_at;
end; $$;

create or replace function public.awn_update_household_name(p_household_id uuid, p_name text)
returns table (household_id uuid, household_name text)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_name text:=btrim(coalesce(p_name,''));
begin
  if v_user_id is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  if length(v_name) not between 1 and 60 then raise exception using errcode='P0001',message='invalid_household_name'; end if;
  if not private.awn_is_private_financial_owner(p_household_id,v_user_id) then raise exception using errcode='42501',message='household_access_denied'; end if;
  update public.households as household set name=v_name,updated_at=now() where household.id=p_household_id returning household.id,household.name into household_id,household_name;
  return next;
end; $$;

create or replace function public.awn_clear_financial_data(p_household_id uuid)
returns table (household_id uuid, profile_data jsonb, revision bigint)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid:=auth.uid(); v_profile public.financial_profiles%rowtype; v_empty jsonb;
begin
  if v_user_id is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  if not private.awn_is_private_financial_owner(p_household_id,v_user_id) then raise exception using errcode='42501',message='household_access_denied'; end if;
  select * into v_profile from public.financial_profiles as profile where profile.household_id=p_household_id for update;
  if not found then raise exception using errcode='P0001',message='financial_profile_not_found'; end if;
  v_empty:=jsonb_build_object('version',2,'country',coalesce(nullif(v_profile.profile_data->>'country',''),v_profile.country,'United Arab Emirates'),'currency',coalesce(nullif(v_profile.profile_data->>'currency',''),v_profile.currency,'AED'),'budgetStartDay',greatest(1,least(28,coalesce((v_profile.profile_data->>'budgetStartDay')::smallint,v_profile.budget_start_day,1))),'cashBalance',0,'incomeSources','[]'::jsonb,'accounts','[]'::jsonb,'debitCards','[]'::jsonb,'creditCards','[]'::jsonb,'categoryBudgets','[]'::jsonb,'customCategories','[]'::jsonb,'monthlyBudgets','[]'::jsonb,'savingsGoals','[]'::jsonb,'onboarding',jsonb_build_object('currentStep',0,'completed',false),'createdAt',coalesce(v_profile.profile_data->'createdAt',to_jsonb(now())),'updatedAt',to_jsonb(now()),'transactions','[]'::jsonb);
  perform private.awn_sync_shared_budget_contributions(p_household_id,v_user_id,v_empty);
  delete from public.transactions where transactions.household_id=p_household_id;
  delete from public.budget_categories where budget_categories.household_id=p_household_id;
  delete from public.savings_goals where savings_goals.household_id=p_household_id;
  delete from public.credit_cards where credit_cards.household_id=p_household_id;
  delete from public.accounts where accounts.household_id=p_household_id;
  delete from public.income_sources where income_sources.household_id=p_household_id;
  delete from public.financial_import_fingerprints where financial_import_fingerprints.household_id=p_household_id;
  update public.financial_profiles as profile set profile_data=v_empty,cash_balance_minor=0,onboarding_step=0,onboarding_completed=false,updated_by_user_id=v_user_id,revision=profile.revision+1,updated_at=now()
  where profile.household_id=p_household_id returning profile.household_id,profile.profile_data,profile.revision into household_id,profile_data,revision;
  return next;
end; $$;

-- SMS imports are private because this wrapper now requires immutable private ownership.
create or replace function public.awn_import_financial_transactions(p_household_id uuid,p_expected_revision bigint,p_profile_data jsonb,p_imports jsonb)
returns table(household_id uuid,profile_data jsonb,revision bigint,initialized_at timestamptz,migrated_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_user_id uuid:=auth.uid(); v_import jsonb; v_saved record;
begin
  if v_user_id is null then raise exception using errcode='P0001',message='authentication_required'; end if;
  if not private.awn_is_private_financial_owner(p_household_id,v_user_id) then raise exception using errcode='42501',message='household_access_denied'; end if;
  if jsonb_typeof(p_imports) is distinct from 'array' or jsonb_array_length(p_imports) not between 1 and 100 then raise exception using errcode='P0001',message='invalid_import_record'; end if;
  if exists(select item->>'fingerprint' from jsonb_array_elements(p_imports) as item group by item->>'fingerprint' having item->>'fingerprint' is null or count(*)>1) then raise exception using errcode='P0001',message='import_duplicate'; end if;
  for v_import in select value from jsonb_array_elements(p_imports) loop
    if coalesce(v_import->>'bank','')<>'fab' or coalesce(v_import->>'messageType','') not in('salary_credit','debit_card_purchase','outward_remittance','inward_remittance','atm_cash_withdrawal') or coalesce(v_import->>'fingerprint','')!~'^fab-v1-[0-9a-f]{16}$' or nullif(v_import->>'transactionId','') is null or v_import?'observedBalanceAfter' and(jsonb_typeof(v_import->'observedBalanceAfter') is distinct from 'number' or(v_import->>'observedBalanceAfter')::numeric<0 or(v_import->>'observedBalanceAfter')::numeric>9007199254740991 or trunc((v_import->>'observedBalanceAfter')::numeric)<>(v_import->>'observedBalanceAfter')::numeric) then raise exception using errcode='P0001',message='invalid_import_record'; end if;
    if not exists(select 1 from jsonb_array_elements(p_profile_data->'transactions') as transaction_data where transaction_data->>'id'=v_import->>'transactionId' and transaction_data->'import'->>'origin'='sms' and transaction_data->'import'->>'bank'=v_import->>'bank' and transaction_data->'import'->>'messageType'=v_import->>'messageType' and transaction_data->'import'->>'fingerprint'=v_import->>'fingerprint') then raise exception using errcode='P0001',message='invalid_import_record'; end if;
    if exists(select 1 from public.financial_import_fingerprints as existing where existing.household_id=p_household_id and existing.fingerprint=v_import->>'fingerprint') then raise exception using errcode='P0001',message='import_duplicate'; end if;
  end loop;
  select saved.* into v_saved from public.awn_save_financial_state(p_household_id,p_expected_revision,p_profile_data,null) as saved;
  begin
    insert into public.financial_import_fingerprints(household_id,fingerprint,bank,message_type,transaction_id,observed_balance_minor,imported_by_user_id)
    select p_household_id,item->>'fingerprint',item->>'bank',item->>'messageType',item->>'transactionId',case when item?'observedBalanceAfter' then(item->>'observedBalanceAfter')::bigint else null end,v_user_id from jsonb_array_elements(p_imports) as item;
  exception when unique_violation then raise exception using errcode='P0001',message='import_duplicate'; end;
  return query select v_saved.household_id,v_saved.profile_data,v_saved.revision,v_saved.initialized_at,v_saved.migrated_at;
end; $$;

-- Realtime invalidation exposes only shared-plan revision changes, never mappings.
do $$ begin
  alter publication supabase_realtime add table public.shared_plan_settings;
exception when duplicate_object then null; end $$;

alter function private.awn_is_private_financial_owner(uuid,uuid) owner to postgres;
alter function private.awn_private_household_id(uuid) owner to postgres;
alter function private.awn_shared_relationship_id(uuid) owner to postgres;
alter function private.awn_ensure_shared_plan_settings(uuid,uuid) owner to postgres;
alter function private.awn_sync_shared_budget_contributions(uuid,uuid,jsonb) owner to postgres;
alter function public.awn_resolve_private_household() owner to postgres;

revoke all on function private.awn_is_private_financial_owner(uuid,uuid) from public, anon, authenticated;
revoke all on function private.awn_private_household_id(uuid) from public, anon, authenticated;
revoke all on function private.awn_shared_relationship_id(uuid) from public, anon, authenticated;
revoke all on function private.awn_ensure_shared_plan_settings(uuid,uuid) from public, anon, authenticated;
revoke all on function private.awn_sync_shared_budget_contributions(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function private.awn_shared_period_key(date,smallint) from public, anon, authenticated;
revoke all on function private.awn_display_name(uuid) from public, anon, authenticated;
revoke all on function private.awn_remove_departing_member_contributions() from public, anon, authenticated;
grant execute on function private.awn_is_private_financial_owner(uuid,uuid) to authenticated;

revoke execute on all functions in schema public from authenticated;
grant execute on function public.awn_resolve_private_household() to authenticated;
grant execute on function public.awn_resolve_active_household(uuid) to authenticated;
grant execute on function public.awn_resolve_personal_household() to authenticated;
grant execute on function public.awn_save_financial_state(uuid,bigint,jsonb,text) to authenticated;
grant execute on function public.awn_import_financial_transactions(uuid,bigint,jsonb,jsonb) to authenticated;
grant execute on function public.awn_update_household_name(uuid,text) to authenticated;
grant execute on function public.awn_clear_financial_data(uuid) to authenticated;
grant execute on function public.awn_get_shared_plan() to authenticated;
grant execute on function public.awn_update_shared_plan_settings(uuid,text,text,smallint) to authenticated;
grant execute on function public.awn_save_shared_budget(uuid,text,bigint,jsonb) to authenticated;
grant execute on function public.awn_get_shared_budget_summary(uuid,text) to authenticated;
grant execute on function public.awn_save_shared_savings_goal(uuid,uuid,text,bigint,bigint,date,smallint) to authenticated;
grant execute on function public.awn_delete_shared_savings_goal(uuid,uuid) to authenticated;
grant execute on function public.awn_add_shared_savings_contribution(uuid,uuid,bigint) to authenticated;
grant execute on function public.awn_get_shared_savings_goals(uuid) to authenticated;

-- Existing invitation/member RPCs remain the only relationship-management surface.
grant execute on function public.awn_list_households() to authenticated;
grant execute on function public.awn_list_household_members(uuid) to authenticated;
grant execute on function public.awn_list_household_invitations(uuid) to authenticated;
grant execute on function public.awn_create_household_invitation(uuid,text) to authenticated;
grant execute on function public.awn_refresh_household_invitation(uuid) to authenticated;
grant execute on function public.awn_get_household_invitation_preview(text) to anon, authenticated;
grant execute on function public.awn_accept_household_invitation(text) to authenticated;
grant execute on function public.awn_decline_household_invitation(text) to authenticated;
grant execute on function public.awn_revoke_household_invitation(uuid) to authenticated;
grant execute on function public.awn_remove_household_member(uuid,uuid) to authenticated;
grant execute on function public.awn_leave_household(uuid) to authenticated;
grant execute on function public.awn_transfer_household_ownership(uuid,uuid) to authenticated;
