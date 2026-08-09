-- AWN Milestone 5B Stage 1: secure cloud financial mutation boundary.
-- Existing opening amounts plus the transaction ledger remain authoritative.

-- Keep every monetary value representable as an exact JavaScript integer.
alter table public.income_sources
  add constraint income_sources_safe_amount_check check (expected_amount_minor <= 9007199254740991);
alter table public.accounts
  add constraint accounts_safe_opening_balance_check check (opening_balance_minor <= 9007199254740991);
alter table public.credit_cards
  add constraint credit_cards_safe_limit_check check (limit_minor <= 9007199254740991),
  add constraint credit_cards_safe_opening_owed_check check (opening_owed_minor <= 9007199254740991);
alter table public.budget_categories
  add constraint budget_categories_safe_limit_check check (monthly_limit_minor <= 9007199254740991);
alter table public.savings_goals
  add constraint savings_goals_safe_target_check check (target_minor <= 9007199254740991),
  add constraint savings_goals_safe_saved_check check (saved_minor <= 9007199254740991),
  add constraint savings_goals_safe_contribution_check check (monthly_contribution_minor <= 9007199254740991);
alter table public.transactions
  add constraint transactions_safe_amount_check check (amount_minor <= 9007199254740991);

-- Client entity identifiers are canonical UUID strings. The profile identifier remains
-- optional because auth-user bootstrap rows predate any local/cloud entity association.
alter table public.financial_profiles
  add constraint financial_profiles_local_entity_id_check check (
    local_entity_id is null or local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
alter table public.income_sources
  add constraint income_sources_local_entity_id_check check (
    local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  add constraint income_sources_trimmed_name_check check (name = btrim(name));
alter table public.accounts
  add constraint accounts_local_entity_id_check check (
    local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  add constraint accounts_trimmed_name_check check (name = btrim(name));
alter table public.credit_cards
  add constraint credit_cards_local_entity_id_check check (
    local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  add constraint credit_cards_trimmed_name_check check (name = btrim(name));
alter table public.budget_categories
  add constraint budget_categories_local_entity_id_check check (
    local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  add constraint budget_categories_trimmed_name_check check (name = btrim(name));
alter table public.savings_goals
  add constraint savings_goals_local_entity_id_check check (
    local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
alter table public.transactions
  add constraint transactions_local_entity_id_check check (
    local_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- Pair every reference with exactly one internally generated historical snapshot and
-- require every field irrelevant to the selected transaction type to remain null.
alter table public.transactions
  add constraint transactions_exact_reference_shape_check check (
    (
      transaction_type = 'income'
      and ((income_source_id is null and income_source_name_snapshot is null)
        or (income_source_id is not null and income_source_name_snapshot is not null
          and income_source_name_snapshot = btrim(income_source_name_snapshot)
          and length(income_source_name_snapshot) between 1 and 160))
      and ((destination_account_id is null and destination_account_name_snapshot is null)
        or (destination_account_id is not null and destination_account_name_snapshot is not null
          and destination_account_name_snapshot = btrim(destination_account_name_snapshot)
          and length(destination_account_name_snapshot) between 1 and 160))
      and category_id is null and category_name_snapshot is null
      and expense_account_id is null and expense_account_name_snapshot is null
      and expense_card_id is null and expense_card_name_snapshot is null
      and source_account_id is null and source_account_name_snapshot is null
      and paying_account_id is null and paying_account_name_snapshot is null
      and receiving_card_id is null and receiving_card_name_snapshot is null
    ) or (
      transaction_type = 'expense'
      and income_source_id is null and income_source_name_snapshot is null
      and destination_account_id is null and destination_account_name_snapshot is null
      and category_name_snapshot is not null
      and category_name_snapshot = btrim(category_name_snapshot)
      and length(category_name_snapshot) between 1 and 160
      and ((expense_account_id is null and expense_account_name_snapshot is null)
        or (expense_account_id is not null and expense_account_name_snapshot is not null
          and expense_account_name_snapshot = btrim(expense_account_name_snapshot)
          and length(expense_account_name_snapshot) between 1 and 160))
      and ((expense_card_id is null and expense_card_name_snapshot is null)
        or (expense_card_id is not null and expense_card_name_snapshot is not null
          and expense_card_name_snapshot = btrim(expense_card_name_snapshot)
          and length(expense_card_name_snapshot) between 1 and 160))
      and num_nonnulls(expense_account_id, expense_card_id) <= 1
      and source_account_id is null and source_account_name_snapshot is null
      and paying_account_id is null and paying_account_name_snapshot is null
      and receiving_card_id is null and receiving_card_name_snapshot is null
    ) or (
      transaction_type = 'transfer'
      and income_source_id is null and income_source_name_snapshot is null
      and destination_account_id is not null and destination_account_name_snapshot is not null
      and destination_account_name_snapshot = btrim(destination_account_name_snapshot)
      and length(destination_account_name_snapshot) between 1 and 160
      and category_id is null and category_name_snapshot is null
      and expense_account_id is null and expense_account_name_snapshot is null
      and expense_card_id is null and expense_card_name_snapshot is null
      and source_account_id is not null and source_account_name_snapshot is not null
      and source_account_name_snapshot = btrim(source_account_name_snapshot)
      and length(source_account_name_snapshot) between 1 and 160
      and source_account_id <> destination_account_id
      and paying_account_id is null and paying_account_name_snapshot is null
      and receiving_card_id is null and receiving_card_name_snapshot is null
    ) or (
      transaction_type = 'card-payment'
      and income_source_id is null and income_source_name_snapshot is null
      and destination_account_id is null and destination_account_name_snapshot is null
      and category_id is null and category_name_snapshot is null
      and expense_account_id is null and expense_account_name_snapshot is null
      and expense_card_id is null and expense_card_name_snapshot is null
      and source_account_id is null and source_account_name_snapshot is null
      and paying_account_id is not null and paying_account_name_snapshot is not null
      and paying_account_name_snapshot = btrim(paying_account_name_snapshot)
      and length(paying_account_name_snapshot) between 1 and 160
      and receiving_card_id is not null and receiving_card_name_snapshot is not null
      and receiving_card_name_snapshot = btrim(receiving_card_name_snapshot)
      and length(receiving_card_name_snapshot) between 1 and 160
    )
  );

-- PostgreSQL does not automatically index referencing foreign-key columns.
create index transactions_income_source_reference_idx on public.transactions (user_id, income_source_id) where income_source_id is not null;
create index transactions_destination_account_reference_idx on public.transactions (user_id, destination_account_id) where destination_account_id is not null;
create index transactions_category_reference_idx on public.transactions (user_id, category_id) where category_id is not null;
create index transactions_expense_account_reference_idx on public.transactions (user_id, expense_account_id) where expense_account_id is not null;
create index transactions_expense_card_reference_idx on public.transactions (user_id, expense_card_id) where expense_card_id is not null;
create index transactions_source_account_reference_idx on public.transactions (user_id, source_account_id) where source_account_id is not null;
create index transactions_paying_account_reference_idx on public.transactions (user_id, paying_account_id) where paying_account_id is not null;
create index transactions_receiving_card_reference_idx on public.transactions (user_id, receiving_card_id) where receiving_card_id is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.awn_lock_financial_profile()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  perform 1
  from public.financial_profiles as profile
  where profile.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'financial_profile_not_found';
  end if;
  return v_user_id;
end;
$$;

create or replace function public.awn_create_credit_card(
  p_local_entity_id text,
  p_name text,
  p_limit_minor bigint,
  p_opening_owed_minor bigint,
  p_due_day smallint
)
returns public.credit_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.credit_cards%rowtype;
begin
  perform private.awn_validate_local_entity_id(p_local_entity_id);
  perform private.awn_validate_nonnegative_money(p_limit_minor);
  perform private.awn_validate_nonnegative_money(p_opening_owed_minor);
  if p_opening_owed_minor > p_limit_minor then raise exception using errcode = 'P0001', message = 'opening_owed_exceeds_limit'; end if;
  if p_due_day is null or p_due_day not between 1 and 31 then raise exception using errcode = 'P0001', message = 'invalid_due_day'; end if;
  select * into v_row from public.credit_cards as card
    where card.user_id = v_user_id and card.local_entity_id = p_local_entity_id;
  if found then
    if v_row.name = v_name and v_row.limit_minor = p_limit_minor
      and v_row.opening_owed_minor = p_opening_owed_minor and v_row.due_day = p_due_day then return v_row; end if;
    raise exception using errcode = 'P0001', message = 'creation_conflict';
  end if;
  insert into public.credit_cards (user_id, local_entity_id, name, limit_minor, opening_owed_minor, due_day)
    values (v_user_id, p_local_entity_id, v_name, p_limit_minor, p_opening_owed_minor, p_due_day)
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.awn_update_credit_card(
  p_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_limit_minor bigint,
  p_opening_owed_minor bigint,
  p_due_day smallint
)
returns public.credit_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.credit_cards%rowtype;
begin
  perform private.awn_validate_nonnegative_money(p_limit_minor);
  perform private.awn_validate_nonnegative_money(p_opening_owed_minor);
  if p_opening_owed_minor > p_limit_minor then raise exception using errcode = 'P0001', message = 'opening_owed_exceeds_limit'; end if;
  if p_due_day is null or p_due_day not between 1 and 31 then raise exception using errcode = 'P0001', message = 'invalid_due_day'; end if;
  if not exists (select 1 from public.credit_cards as card where card.user_id = v_user_id and card.id = p_id) then
    raise exception using errcode = 'P0001', message = 'credit_card_not_found';
  end if;
  update public.credit_cards as card
  set name = v_name, limit_minor = p_limit_minor, opening_owed_minor = p_opening_owed_minor,
      due_day = p_due_day, revision = card.revision + 1, updated_at = pg_catalog.now()
  where card.user_id = v_user_id and card.id = p_id and card.revision = p_expected_revision
  returning card.* into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;
  perform private.awn_assert_card_ledger_valid(v_user_id);
  return v_row;
end;
$$;

create or replace function public.awn_delete_credit_card(p_id uuid, p_expected_revision bigint)
returns public.credit_cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_row public.credit_cards%rowtype;
begin
  select * into v_row from public.credit_cards as card where card.user_id = v_user_id and card.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'credit_card_not_found'; end if;
  if v_row.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
  if exists (
    select 1 from public.transactions as transaction where transaction.user_id = v_user_id
      and p_id in (transaction.expense_card_id, transaction.receiving_card_id)
  ) then raise exception using errcode = 'P0001', message = 'entity_referenced'; end if;
  delete from public.credit_cards as card where card.user_id = v_user_id and card.id = p_id returning card.* into v_row;
  return v_row;
end;
$$;

create or replace function public.awn_create_category(
  p_local_entity_id text,
  p_name text,
  p_monthly_limit_minor bigint
)
returns public.budget_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.budget_categories%rowtype;
begin
  perform private.awn_validate_local_entity_id(p_local_entity_id);
  perform private.awn_validate_positive_money(p_monthly_limit_minor);
  select * into v_row from public.budget_categories as category
    where category.user_id = v_user_id and category.local_entity_id = p_local_entity_id;
  if found then
    if v_row.name = v_name and v_row.monthly_limit_minor = p_monthly_limit_minor then return v_row; end if;
    raise exception using errcode = 'P0001', message = 'creation_conflict';
  end if;
  if exists (select 1 from public.budget_categories as category
    where category.user_id = v_user_id and pg_catalog.lower(category.name) = pg_catalog.lower(v_name)) then
    raise exception using errcode = 'P0001', message = 'category_name_conflict';
  end if;
  insert into public.budget_categories (user_id, local_entity_id, name, monthly_limit_minor)
    values (v_user_id, p_local_entity_id, v_name, p_monthly_limit_minor)
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.awn_update_category(
  p_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_monthly_limit_minor bigint
)
returns public.budget_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.budget_categories%rowtype;
begin
  perform private.awn_validate_positive_money(p_monthly_limit_minor);
  if not exists (select 1 from public.budget_categories as category where category.user_id = v_user_id and category.id = p_id) then
    raise exception using errcode = 'P0001', message = 'category_not_found';
  end if;
  if exists (select 1 from public.budget_categories as category
    where category.user_id = v_user_id and category.id <> p_id
      and pg_catalog.lower(category.name) = pg_catalog.lower(v_name)) then
    raise exception using errcode = 'P0001', message = 'category_name_conflict';
  end if;
  update public.budget_categories as category
  set name = v_name, monthly_limit_minor = p_monthly_limit_minor,
      revision = category.revision + 1, updated_at = pg_catalog.now()
  where category.user_id = v_user_id and category.id = p_id and category.revision = p_expected_revision
  returning category.* into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;
  return v_row;
end;
$$;

create or replace function public.awn_delete_category(p_id uuid, p_expected_revision bigint)
returns public.budget_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_row public.budget_categories%rowtype;
begin
  select * into v_row from public.budget_categories as category where category.user_id = v_user_id and category.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'category_not_found'; end if;
  if v_row.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
  if exists (select 1 from public.transactions as transaction where transaction.user_id = v_user_id and transaction.category_id = p_id) then
    raise exception using errcode = 'P0001', message = 'entity_referenced';
  end if;
  delete from public.budget_categories as category where category.user_id = v_user_id and category.id = p_id returning category.* into v_row;
  return v_row;
end;
$$;

create or replace function private.awn_canonical_name(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value text := pg_catalog.btrim(p_value);
begin
  if p_value is null or pg_catalog.length(v_value) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'invalid_name';
  end if;
  return v_value;
end;
$$;

create or replace function private.awn_canonical_note(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value text := pg_catalog.btrim(p_value);
begin
  if v_value = '' then v_value := null; end if;
  if v_value is not null and pg_catalog.length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_note';
  end if;
  return v_value;
end;
$$;

-- All public mutations serialize on the caller's profile row. They deliberately
-- accept no ownership argument: auth.uid() is the sole ownership source.
create or replace function public.awn_update_financial_profile(
  p_expected_revision bigint,
  p_currency text,
  p_onboarding_step smallint,
  p_onboarding_completed boolean
)
returns public.financial_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_row public.financial_profiles%rowtype;
begin
  if p_currency is null or p_currency not in ('AED', 'USD', 'EUR', 'GBP', 'SAR')
    or p_onboarding_step is null or p_onboarding_step not between 1 and 5
    or p_onboarding_completed is null then
    raise exception using errcode = 'P0001', message = 'invalid_financial_profile';
  end if;

  update public.financial_profiles as profile
  set currency = p_currency,
      onboarding_step = p_onboarding_step,
      onboarding_completed = p_onboarding_completed,
      revision = profile.revision + 1,
      updated_at = pg_catalog.now()
  where profile.user_id = v_user_id and profile.revision = p_expected_revision
  returning profile.* into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;
  return v_row;
end;
$$;

create or replace function public.awn_create_income_source(
  p_local_entity_id text,
  p_name text,
  p_expected_amount_minor bigint,
  p_expected_day smallint
)
returns public.income_sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.income_sources%rowtype;
begin
  perform private.awn_validate_local_entity_id(p_local_entity_id);
  perform private.awn_validate_positive_money(p_expected_amount_minor);
  if p_expected_day is null or p_expected_day not between 1 and 31 then raise exception using errcode = 'P0001', message = 'invalid_expected_day'; end if;
  select * into v_row from public.income_sources as source
    where source.user_id = v_user_id and source.local_entity_id = p_local_entity_id;
  if found then
    if v_row.name = v_name and v_row.expected_amount_minor = p_expected_amount_minor
      and v_row.expected_day = p_expected_day then return v_row; end if;
    raise exception using errcode = 'P0001', message = 'creation_conflict';
  end if;
  insert into public.income_sources (user_id, local_entity_id, name, expected_amount_minor, expected_day)
    values (v_user_id, p_local_entity_id, v_name, p_expected_amount_minor, p_expected_day)
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.awn_update_income_source(
  p_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_expected_amount_minor bigint,
  p_expected_day smallint
)
returns public.income_sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.income_sources%rowtype;
begin
  perform private.awn_validate_positive_money(p_expected_amount_minor);
  if p_expected_day is null or p_expected_day not between 1 and 31 then raise exception using errcode = 'P0001', message = 'invalid_expected_day'; end if;
  if not exists (select 1 from public.income_sources as source where source.user_id = v_user_id and source.id = p_id) then
    raise exception using errcode = 'P0001', message = 'income_source_not_found';
  end if;
  update public.income_sources as source
  set name = v_name, expected_amount_minor = p_expected_amount_minor, expected_day = p_expected_day,
      revision = source.revision + 1, updated_at = pg_catalog.now()
  where source.user_id = v_user_id and source.id = p_id and source.revision = p_expected_revision
  returning source.* into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;
  return v_row;
end;
$$;

create or replace function public.awn_delete_income_source(p_id uuid, p_expected_revision bigint)
returns public.income_sources
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_row public.income_sources%rowtype;
begin
  select * into v_row from public.income_sources as source where source.user_id = v_user_id and source.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'income_source_not_found'; end if;
  if v_row.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
  if exists (select 1 from public.transactions as transaction where transaction.user_id = v_user_id and transaction.income_source_id = p_id) then
    raise exception using errcode = 'P0001', message = 'entity_referenced';
  end if;
  delete from public.income_sources as source where source.user_id = v_user_id and source.id = p_id returning source.* into v_row;
  return v_row;
end;
$$;

create or replace function public.awn_create_account(
  p_local_entity_id text,
  p_name text,
  p_account_type text,
  p_opening_balance_minor bigint
)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.accounts%rowtype;
begin
  perform private.awn_validate_local_entity_id(p_local_entity_id);
  perform private.awn_validate_nonnegative_money(p_opening_balance_minor);
  if p_account_type is null or p_account_type not in ('current', 'savings', 'cash') then raise exception using errcode = 'P0001', message = 'invalid_account_type'; end if;
  select * into v_row from public.accounts as account
    where account.user_id = v_user_id and account.local_entity_id = p_local_entity_id;
  if found then
    if v_row.name = v_name and v_row.account_type = p_account_type
      and v_row.opening_balance_minor = p_opening_balance_minor then return v_row; end if;
    raise exception using errcode = 'P0001', message = 'creation_conflict';
  end if;
  insert into public.accounts (user_id, local_entity_id, name, account_type, opening_balance_minor)
    values (v_user_id, p_local_entity_id, v_name, p_account_type, p_opening_balance_minor)
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.awn_update_account(
  p_id uuid,
  p_expected_revision bigint,
  p_name text,
  p_account_type text,
  p_opening_balance_minor bigint
)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_name text := private.awn_canonical_name(p_name);
  v_row public.accounts%rowtype;
begin
  perform private.awn_validate_nonnegative_money(p_opening_balance_minor);
  if p_account_type is null or p_account_type not in ('current', 'savings', 'cash') then raise exception using errcode = 'P0001', message = 'invalid_account_type'; end if;
  if not exists (select 1 from public.accounts as account where account.user_id = v_user_id and account.id = p_id) then
    raise exception using errcode = 'P0001', message = 'account_not_found';
  end if;
  update public.accounts as account
  set name = v_name, account_type = p_account_type, opening_balance_minor = p_opening_balance_minor,
      revision = account.revision + 1, updated_at = pg_catalog.now()
  where account.user_id = v_user_id and account.id = p_id and account.revision = p_expected_revision
  returning account.* into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;
  return v_row;
end;
$$;

create or replace function public.awn_delete_account(p_id uuid, p_expected_revision bigint)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_row public.accounts%rowtype;
begin
  select * into v_row from public.accounts as account where account.user_id = v_user_id and account.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'account_not_found'; end if;
  if v_row.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
  if exists (
    select 1 from public.transactions as transaction where transaction.user_id = v_user_id
      and p_id in (transaction.destination_account_id, transaction.expense_account_id,
        transaction.source_account_id, transaction.paying_account_id)
  ) then raise exception using errcode = 'P0001', message = 'entity_referenced'; end if;
  delete from public.accounts as account where account.user_id = v_user_id and account.id = p_id returning account.* into v_row;
  return v_row;
end;
$$;

create or replace function private.awn_validate_local_entity_id(p_value text)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = 'P0001', message = 'invalid_local_entity_id';
  end if;
end;
$$;

create or replace function private.awn_validate_nonnegative_money(p_value bigint)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null or p_value < 0 or p_value > 9007199254740991 then
    raise exception using errcode = 'P0001', message = 'invalid_amount';
  end if;
end;
$$;

create or replace function private.awn_validate_positive_money(p_value bigint)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_value is null or p_value <= 0 or p_value > 9007199254740991 then
    raise exception using errcode = 'P0001', message = 'invalid_amount';
  end if;
end;
$$;

create or replace function private.awn_income_source_name(p_user_id uuid, p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare v_name text;
begin
  select source.name into v_name
  from public.income_sources as source
  where source.user_id = p_user_id and source.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_reference'; end if;
  return v_name;
end;
$$;

create or replace function private.awn_account_name(p_user_id uuid, p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare v_name text;
begin
  select account.name into v_name
  from public.accounts as account
  where account.user_id = p_user_id and account.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_reference'; end if;
  return v_name;
end;
$$;

create or replace function private.awn_credit_card_name(p_user_id uuid, p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare v_name text;
begin
  select card.name into v_name
  from public.credit_cards as card
  where card.user_id = p_user_id and card.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_reference'; end if;
  return v_name;
end;
$$;

create or replace function private.awn_category_name(p_user_id uuid, p_id uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare v_name text;
begin
  select category.name into v_name
  from public.budget_categories as category
  where category.user_id = p_user_id and category.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'invalid_reference'; end if;
  return v_name;
end;
$$;

create or replace function private.awn_assert_card_ledger_valid(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (
      select
        card.id,
        card.opening_owed_minor + pg_catalog.sum(
          case
            when transaction.transaction_type = 'expense' then transaction.amount_minor
            else -transaction.amount_minor
          end
        ) over (
          partition by card.id
          order by transaction.transaction_date, transaction.created_at, transaction.id
          rows between unbounded preceding and current row
        ) as chronological_owed_minor
      from public.credit_cards as card
      join public.transactions as transaction
        on transaction.user_id = card.user_id
        and (
          (transaction.transaction_type = 'expense' and transaction.expense_card_id = card.id)
          or (transaction.transaction_type = 'card-payment' and transaction.receiving_card_id = card.id)
        )
      where card.user_id = p_user_id
    ) as ledger
    where ledger.chronological_owed_minor < 0
  ) then
    raise exception using errcode = 'P0001', message = 'negative_card_debt';
  end if;
end;
$$;

create or replace function private.awn_validate_transaction_input(
  p_transaction_type text,
  p_amount_minor bigint,
  p_transaction_date date,
  p_income_source_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_category_name text,
  p_expense_account_id uuid,
  p_expense_card_id uuid,
  p_source_account_id uuid,
  p_paying_account_id uuid,
  p_receiving_card_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.awn_validate_positive_money(p_amount_minor);
  if p_transaction_date is null or p_transaction_date > current_date then
    raise exception using errcode = 'P0001', message = 'invalid_transaction_date';
  end if;

  if p_transaction_type = 'income' then
    if p_category_id is not null or p_category_name is not null
      or p_expense_account_id is not null or p_expense_card_id is not null
      or p_source_account_id is not null or p_paying_account_id is not null
      or p_receiving_card_id is not null then
      raise exception using errcode = 'P0001', message = 'invalid_transaction_shape';
    end if;
  elsif p_transaction_type = 'expense' then
    if p_income_source_id is not null or p_destination_account_id is not null
      or p_source_account_id is not null or p_paying_account_id is not null
      or p_receiving_card_id is not null
      or pg_catalog.num_nonnulls(p_expense_account_id, p_expense_card_id) > 1
      or (p_category_id is null and p_category_name is null)
      or (p_category_id is not null and p_category_name is not null) then
      raise exception using errcode = 'P0001', message = 'invalid_transaction_shape';
    end if;
    if p_category_id is null then perform private.awn_canonical_name(p_category_name); end if;
  elsif p_transaction_type = 'transfer' then
    if p_source_account_id is null or p_destination_account_id is null
      or p_source_account_id = p_destination_account_id
      or p_income_source_id is not null or p_category_id is not null
      or p_category_name is not null or p_expense_account_id is not null
      or p_expense_card_id is not null or p_paying_account_id is not null
      or p_receiving_card_id is not null then
      raise exception using errcode = 'P0001', message = 'invalid_transaction_shape';
    end if;
  elsif p_transaction_type = 'card-payment' then
    if p_paying_account_id is null or p_receiving_card_id is null
      or p_income_source_id is not null or p_destination_account_id is not null
      or p_category_id is not null or p_category_name is not null
      or p_expense_account_id is not null or p_expense_card_id is not null
      or p_source_account_id is not null then
      raise exception using errcode = 'P0001', message = 'invalid_transaction_shape';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'invalid_transaction_type';
  end if;
end;
$$;

create or replace function public.awn_create_transaction(
  p_local_entity_id text,
  p_idempotency_key uuid,
  p_transaction_type text,
  p_amount_minor bigint,
  p_transaction_date date,
  p_note text,
  p_income_source_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_category_name text,
  p_expense_account_id uuid,
  p_expense_card_id uuid,
  p_source_account_id uuid,
  p_paying_account_id uuid,
  p_receiving_card_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_note text := private.awn_canonical_note(p_note);
  v_category_name text;
  v_income_source_name text;
  v_destination_account_name text;
  v_expense_account_name text;
  v_expense_card_name text;
  v_source_account_name text;
  v_paying_account_name text;
  v_receiving_card_name text;
  v_row public.transactions%rowtype;
begin
  perform private.awn_validate_local_entity_id(p_local_entity_id);
  if p_idempotency_key is null then raise exception using errcode = 'P0001', message = 'invalid_idempotency_key'; end if;
  perform private.awn_validate_transaction_input(
    p_transaction_type, p_amount_minor, p_transaction_date, p_income_source_id,
    p_destination_account_id, p_category_id, p_category_name, p_expense_account_id,
    p_expense_card_id, p_source_account_id, p_paying_account_id, p_receiving_card_id
  );
  if p_transaction_type = 'expense' and p_category_id is null then
    v_category_name := private.awn_canonical_name(p_category_name);
  end if;

  select * into v_row from public.transactions as transaction
    where transaction.user_id = v_user_id and transaction.idempotency_key = p_idempotency_key;
  if found then
    if v_row.local_entity_id = p_local_entity_id
      and v_row.transaction_type = p_transaction_type
      and v_row.amount_minor = p_amount_minor
      and v_row.transaction_date = p_transaction_date
      and v_row.note is not distinct from v_note
      and v_row.income_source_id is not distinct from p_income_source_id
      and v_row.destination_account_id is not distinct from p_destination_account_id
      and v_row.category_id is not distinct from p_category_id
      and (p_transaction_type <> 'expense' or p_category_id is not null
        or v_row.category_name_snapshot = v_category_name)
      and v_row.expense_account_id is not distinct from p_expense_account_id
      and v_row.expense_card_id is not distinct from p_expense_card_id
      and v_row.source_account_id is not distinct from p_source_account_id
      and v_row.paying_account_id is not distinct from p_paying_account_id
      and v_row.receiving_card_id is not distinct from p_receiving_card_id then
      return v_row;
    end if;
    raise exception using errcode = 'P0001', message = 'idempotency_conflict';
  end if;
  if exists (select 1 from public.transactions as transaction
    where transaction.user_id = v_user_id and transaction.local_entity_id = p_local_entity_id) then
    raise exception using errcode = 'P0001', message = 'creation_conflict';
  end if;

  if p_income_source_id is not null then v_income_source_name := private.awn_income_source_name(v_user_id, p_income_source_id); end if;
  if p_destination_account_id is not null then v_destination_account_name := private.awn_account_name(v_user_id, p_destination_account_id); end if;
  if p_category_id is not null then v_category_name := private.awn_category_name(v_user_id, p_category_id); end if;
  if p_expense_account_id is not null then v_expense_account_name := private.awn_account_name(v_user_id, p_expense_account_id); end if;
  if p_expense_card_id is not null then v_expense_card_name := private.awn_credit_card_name(v_user_id, p_expense_card_id); end if;
  if p_source_account_id is not null then v_source_account_name := private.awn_account_name(v_user_id, p_source_account_id); end if;
  if p_paying_account_id is not null then v_paying_account_name := private.awn_account_name(v_user_id, p_paying_account_id); end if;
  if p_receiving_card_id is not null then v_receiving_card_name := private.awn_credit_card_name(v_user_id, p_receiving_card_id); end if;

  insert into public.transactions (
    user_id, local_entity_id, idempotency_key, transaction_type, amount_minor,
    transaction_date, note, income_source_id, income_source_name_snapshot,
    destination_account_id, destination_account_name_snapshot, category_id,
    category_name_snapshot, expense_account_id, expense_account_name_snapshot,
    expense_card_id, expense_card_name_snapshot, source_account_id,
    source_account_name_snapshot, paying_account_id, paying_account_name_snapshot,
    receiving_card_id, receiving_card_name_snapshot
  ) values (
    v_user_id, p_local_entity_id, p_idempotency_key, p_transaction_type, p_amount_minor,
    p_transaction_date, v_note, p_income_source_id, v_income_source_name,
    p_destination_account_id, v_destination_account_name, p_category_id,
    v_category_name, p_expense_account_id, v_expense_account_name,
    p_expense_card_id, v_expense_card_name, p_source_account_id,
    v_source_account_name, p_paying_account_id, v_paying_account_name,
    p_receiving_card_id, v_receiving_card_name
  ) returning * into v_row;
  perform private.awn_assert_card_ledger_valid(v_user_id);
  return v_row;
end;
$$;

create or replace function public.awn_update_transaction(
  p_id uuid,
  p_expected_revision bigint,
  p_transaction_type text,
  p_amount_minor bigint,
  p_transaction_date date,
  p_note text,
  p_income_source_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid,
  p_category_name text,
  p_expense_account_id uuid,
  p_expense_card_id uuid,
  p_source_account_id uuid,
  p_paying_account_id uuid,
  p_receiving_card_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_note text := private.awn_canonical_note(p_note);
  v_category_name text;
  v_income_source_name text;
  v_destination_account_name text;
  v_expense_account_name text;
  v_expense_card_name text;
  v_source_account_name text;
  v_paying_account_name text;
  v_receiving_card_name text;
  v_old public.transactions%rowtype;
  v_row public.transactions%rowtype;
begin
  perform private.awn_validate_transaction_input(
    p_transaction_type, p_amount_minor, p_transaction_date, p_income_source_id,
    p_destination_account_id, p_category_id, p_category_name, p_expense_account_id,
    p_expense_card_id, p_source_account_id, p_paying_account_id, p_receiving_card_id
  );
  select * into v_old from public.transactions as transaction
    where transaction.user_id = v_user_id and transaction.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'transaction_not_found'; end if;
  if v_old.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;

  if p_income_source_id is not null then
    v_income_source_name := case when p_income_source_id = v_old.income_source_id
      then v_old.income_source_name_snapshot else private.awn_income_source_name(v_user_id, p_income_source_id) end;
  end if;
  if p_destination_account_id is not null then
    v_destination_account_name := case when p_destination_account_id = v_old.destination_account_id
      then v_old.destination_account_name_snapshot else private.awn_account_name(v_user_id, p_destination_account_id) end;
  end if;
  if p_category_id is not null then
    v_category_name := case when p_category_id = v_old.category_id
      then v_old.category_name_snapshot else private.awn_category_name(v_user_id, p_category_id) end;
  elsif p_transaction_type = 'expense' then
    v_category_name := private.awn_canonical_name(p_category_name);
  end if;
  if p_expense_account_id is not null then
    v_expense_account_name := case when p_expense_account_id = v_old.expense_account_id
      then v_old.expense_account_name_snapshot else private.awn_account_name(v_user_id, p_expense_account_id) end;
  end if;
  if p_expense_card_id is not null then
    v_expense_card_name := case when p_expense_card_id = v_old.expense_card_id
      then v_old.expense_card_name_snapshot else private.awn_credit_card_name(v_user_id, p_expense_card_id) end;
  end if;
  if p_source_account_id is not null then
    v_source_account_name := case when p_source_account_id = v_old.source_account_id
      then v_old.source_account_name_snapshot else private.awn_account_name(v_user_id, p_source_account_id) end;
  end if;
  if p_paying_account_id is not null then
    v_paying_account_name := case when p_paying_account_id = v_old.paying_account_id
      then v_old.paying_account_name_snapshot else private.awn_account_name(v_user_id, p_paying_account_id) end;
  end if;
  if p_receiving_card_id is not null then
    v_receiving_card_name := case when p_receiving_card_id = v_old.receiving_card_id
      then v_old.receiving_card_name_snapshot else private.awn_credit_card_name(v_user_id, p_receiving_card_id) end;
  end if;

  update public.transactions as transaction
  set transaction_type = p_transaction_type, amount_minor = p_amount_minor,
      transaction_date = p_transaction_date, note = v_note,
      income_source_id = p_income_source_id, income_source_name_snapshot = v_income_source_name,
      destination_account_id = p_destination_account_id, destination_account_name_snapshot = v_destination_account_name,
      category_id = p_category_id, category_name_snapshot = v_category_name,
      expense_account_id = p_expense_account_id, expense_account_name_snapshot = v_expense_account_name,
      expense_card_id = p_expense_card_id, expense_card_name_snapshot = v_expense_card_name,
      source_account_id = p_source_account_id, source_account_name_snapshot = v_source_account_name,
      paying_account_id = p_paying_account_id, paying_account_name_snapshot = v_paying_account_name,
      receiving_card_id = p_receiving_card_id, receiving_card_name_snapshot = v_receiving_card_name,
      revision = transaction.revision + 1, updated_at = pg_catalog.now()
  where transaction.user_id = v_user_id and transaction.id = p_id and transaction.revision = p_expected_revision
  returning transaction.* into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'revision_conflict'; end if;
  perform private.awn_assert_card_ledger_valid(v_user_id);
  return v_row;
end;
$$;

create or replace function public.awn_delete_transaction(p_id uuid, p_expected_revision bigint)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.awn_lock_financial_profile();
  v_row public.transactions%rowtype;
begin
  select * into v_row from public.transactions as transaction where transaction.user_id = v_user_id and transaction.id = p_id;
  if not found then raise exception using errcode = 'P0001', message = 'transaction_not_found'; end if;
  if v_row.revision is distinct from p_expected_revision then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
  delete from public.transactions as transaction
    where transaction.user_id = v_user_id and transaction.id = p_id and transaction.revision = p_expected_revision
    returning transaction.* into v_row;
  if not found then
    raise exception using errcode = 'P0001', message = 'revision_conflict';
  end if;
  perform private.awn_assert_card_ledger_valid(v_user_id);
  return v_row;
end;
$$;

-- Keep owner-scoped reads under the existing RLS policies, but force all supported
-- mutations through the serialized and validated functions above.
revoke insert, update, delete on table public.financial_profiles, public.income_sources,
  public.accounts, public.credit_cards, public.budget_categories, public.transactions
  from authenticated;
grant select on table public.financial_profiles, public.income_sources, public.accounts,
  public.credit_cards, public.budget_categories, public.transactions to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

alter function public.awn_update_financial_profile(bigint, text, smallint, boolean) owner to postgres;
alter function public.awn_create_income_source(text, text, bigint, smallint) owner to postgres;
alter function public.awn_update_income_source(uuid, bigint, text, bigint, smallint) owner to postgres;
alter function public.awn_delete_income_source(uuid, bigint) owner to postgres;
alter function public.awn_create_account(text, text, text, bigint) owner to postgres;
alter function public.awn_update_account(uuid, bigint, text, text, bigint) owner to postgres;
alter function public.awn_delete_account(uuid, bigint) owner to postgres;
alter function public.awn_create_credit_card(text, text, bigint, bigint, smallint) owner to postgres;
alter function public.awn_update_credit_card(uuid, bigint, text, bigint, bigint, smallint) owner to postgres;
alter function public.awn_delete_credit_card(uuid, bigint) owner to postgres;
alter function public.awn_create_category(text, text, bigint) owner to postgres;
alter function public.awn_update_category(uuid, bigint, text, bigint) owner to postgres;
alter function public.awn_delete_category(uuid, bigint) owner to postgres;
alter function public.awn_create_transaction(text, uuid, text, bigint, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid) owner to postgres;
alter function public.awn_update_transaction(uuid, bigint, text, bigint, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid) owner to postgres;
alter function public.awn_delete_transaction(uuid, bigint) owner to postgres;

revoke all on function public.awn_update_financial_profile(bigint, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.awn_create_income_source(text, text, bigint, smallint) from public, anon, authenticated;
revoke all on function public.awn_update_income_source(uuid, bigint, text, bigint, smallint) from public, anon, authenticated;
revoke all on function public.awn_delete_income_source(uuid, bigint) from public, anon, authenticated;
revoke all on function public.awn_create_account(text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.awn_update_account(uuid, bigint, text, text, bigint) from public, anon, authenticated;
revoke all on function public.awn_delete_account(uuid, bigint) from public, anon, authenticated;
revoke all on function public.awn_create_credit_card(text, text, bigint, bigint, smallint) from public, anon, authenticated;
revoke all on function public.awn_update_credit_card(uuid, bigint, text, bigint, bigint, smallint) from public, anon, authenticated;
revoke all on function public.awn_delete_credit_card(uuid, bigint) from public, anon, authenticated;
revoke all on function public.awn_create_category(text, text, bigint) from public, anon, authenticated;
revoke all on function public.awn_update_category(uuid, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.awn_delete_category(uuid, bigint) from public, anon, authenticated;
revoke all on function public.awn_create_transaction(text, uuid, text, bigint, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.awn_update_transaction(uuid, bigint, text, bigint, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.awn_delete_transaction(uuid, bigint) from public, anon, authenticated;

grant execute on function public.awn_update_financial_profile(bigint, text, smallint, boolean) to authenticated;
grant execute on function public.awn_create_income_source(text, text, bigint, smallint) to authenticated;
grant execute on function public.awn_update_income_source(uuid, bigint, text, bigint, smallint) to authenticated;
grant execute on function public.awn_delete_income_source(uuid, bigint) to authenticated;
grant execute on function public.awn_create_account(text, text, text, bigint) to authenticated;
grant execute on function public.awn_update_account(uuid, bigint, text, text, bigint) to authenticated;
grant execute on function public.awn_delete_account(uuid, bigint) to authenticated;
grant execute on function public.awn_create_credit_card(text, text, bigint, bigint, smallint) to authenticated;
grant execute on function public.awn_update_credit_card(uuid, bigint, text, bigint, bigint, smallint) to authenticated;
grant execute on function public.awn_delete_credit_card(uuid, bigint) to authenticated;
grant execute on function public.awn_create_category(text, text, bigint) to authenticated;
grant execute on function public.awn_update_category(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.awn_delete_category(uuid, bigint) to authenticated;
grant execute on function public.awn_create_transaction(text, uuid, text, bigint, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.awn_update_transaction(uuid, bigint, text, bigint, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.awn_delete_transaction(uuid, bigint) to authenticated;
