-- AWN Settings v1: minimal user-scoped display preferences and focused
-- Household settings mutations. Financial data remains the canonical profile snapshot.

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (display_name = btrim(display_name) and length(display_name) <= 60),
  currency_placement text not null default 'before' check (currency_placement in ('before', 'after')),
  number_format text not null default 'comma-dot' check (number_format in ('comma-dot', 'dot-comma', 'space-comma')),
  date_format text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
create policy "Users select their preferences" on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy "Users insert their preferences" on public.user_preferences for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their preferences" on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on table public.user_preferences from public, anon, authenticated;
grant select, insert, update on table public.user_preferences to authenticated;

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
  select household.id, household.name, membership.role,
    (select count(*) from public.household_members as counted where counted.household_id = household.id),
    profile.profile_data, profile.revision, profile.initialized_at, profile.migrated_at
  from public.households as household
  join public.household_members as membership
    on membership.household_id = household.id and membership.user_id = v_user_id
  join public.financial_profiles as profile on profile.household_id = household.id
  where household.id = v_household_id;
end;
$$;

create function public.awn_update_household_name(p_household_id uuid, p_name text)
returns table (household_id uuid, household_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if length(v_name) < 1 or length(v_name) > 60 then raise exception using errcode = 'P0001', message = 'invalid_household_name'; end if;
  if not exists (
    select 1 from public.household_members as membership
    where membership.household_id = p_household_id and membership.user_id = v_user_id and membership.role = 'owner'
  ) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;

  update public.households as household set name = v_name, updated_at = now()
  where household.id = p_household_id
  returning household.id, household.name into household_id, household_name;
  if household_id is null then raise exception using errcode = 'P0001', message = 'household_not_found'; end if;
  return next;
end;
$$;

create function public.awn_clear_financial_data(p_household_id uuid)
returns table (household_id uuid, profile_data jsonb, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.financial_profiles%rowtype;
  v_empty jsonb;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not exists (
    select 1 from public.household_members as membership
    where membership.household_id = p_household_id and membership.user_id = v_user_id and membership.role = 'owner'
  ) then raise exception using errcode = '42501', message = 'household_access_denied'; end if;
  if (select count(*) from public.household_members as membership where membership.household_id = p_household_id) > 1 then
    raise exception using errcode = 'P0001', message = 'shared_household_clear_blocked';
  end if;

  select * into v_profile from public.financial_profiles as profile
  where profile.household_id = p_household_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'financial_profile_not_found'; end if;

  v_empty := jsonb_build_object(
    'version', 2,
    'country', coalesce(nullif(v_profile.profile_data->>'country', ''), v_profile.country, 'United Arab Emirates'),
    'currency', coalesce(nullif(v_profile.profile_data->>'currency', ''), v_profile.currency, 'AED'),
    'budgetStartDay', greatest(1, least(28, coalesce((v_profile.profile_data->>'budgetStartDay')::smallint, v_profile.budget_start_day, 1))),
    'cashBalance', 0,
    'incomeSources', '[]'::jsonb,
    'accounts', '[]'::jsonb,
    'debitCards', '[]'::jsonb,
    'creditCards', '[]'::jsonb,
    'categoryBudgets', '[]'::jsonb,
    'customCategories', '[]'::jsonb,
    'monthlyBudgets', '[]'::jsonb,
    'savingsGoals', '[]'::jsonb,
    'onboarding', jsonb_build_object('currentStep', 0, 'completed', false),
    'createdAt', coalesce(v_profile.profile_data->'createdAt', to_jsonb(now())),
    'updatedAt', to_jsonb(now()),
    'transactions', '[]'::jsonb
  );

  delete from public.transactions where transactions.household_id = p_household_id;
  delete from public.budget_categories where budget_categories.household_id = p_household_id;
  delete from public.savings_goals where savings_goals.household_id = p_household_id;
  delete from public.credit_cards where credit_cards.household_id = p_household_id;
  delete from public.accounts where accounts.household_id = p_household_id;
  delete from public.income_sources where income_sources.household_id = p_household_id;
  delete from public.financial_import_fingerprints where financial_import_fingerprints.household_id = p_household_id;

  update public.financial_profiles as profile
  set profile_data = v_empty,
      cash_balance_minor = 0,
      onboarding_step = 0,
      onboarding_completed = false,
      updated_by_user_id = v_user_id,
      revision = profile.revision + 1,
      updated_at = now()
  where profile.household_id = p_household_id
  returning profile.household_id, profile.profile_data, profile.revision
  into household_id, profile_data, revision;
  return next;
end;
$$;

alter function public.awn_resolve_personal_household() owner to postgres;
alter function public.awn_update_household_name(uuid, text) owner to postgres;
alter function public.awn_clear_financial_data(uuid) owner to postgres;
revoke all on function public.awn_resolve_personal_household() from public, anon, authenticated;
revoke all on function public.awn_update_household_name(uuid, text) from public, anon, authenticated;
revoke all on function public.awn_clear_financial_data(uuid) from public, anon, authenticated;
grant execute on function public.awn_resolve_personal_household() to authenticated;
grant execute on function public.awn_update_household_name(uuid, text) to authenticated;
grant execute on function public.awn_clear_financial_data(uuid) to authenticated;
