-- Mobile-readiness blocker: make the database enforce the canonical private
-- financial profile contract before any revision-checked snapshot is saved.

create or replace function private.awn_jsonb_is_integer_between(
  p_value jsonb,
  p_min numeric,
  p_max numeric
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value numeric;
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'number' then return false; end if;
  v_value := (p_value #>> '{}')::numeric;
  return pg_catalog.trunc(v_value) = v_value and v_value between p_min and p_max;
exception when others then
  return false;
end;
$$;

create or replace function private.awn_jsonb_is_trimmed_text(
  p_value jsonb,
  p_max_length integer
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_typeof(p_value) = 'string'
    and pg_catalog.length(p_value #>> '{}') between 1 and p_max_length
    and pg_catalog.btrim(p_value #>> '{}') = p_value #>> '{}', false)
$$;

create or replace function private.awn_jsonb_is_date(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value text;
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'string' then return false; end if;
  v_value := p_value #>> '{}';
  if v_value !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  return pg_catalog.to_char(v_value::date, 'YYYY-MM-DD') = v_value;
exception when others then
  return false;
end;
$$;

create or replace function private.awn_jsonb_is_month(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~ '^\d{4}-(0[1-9]|1[0-2])$', false)
$$;

create or replace function private.awn_jsonb_is_timestamp(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_value text;
  v_timestamp timestamptz;
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'string' then return false; end if;
  v_value := p_value #>> '{}';
  if v_value !~ '^\d{4}-\d{2}-\d{2}T' then return false; end if;
  v_timestamp := v_value::timestamptz;
  return v_timestamp is not null;
exception when others then
  return false;
end;
$$;

create or replace function private.awn_jsonb_is_uuid(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_uuid uuid;
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'string' then return false; end if;
  v_uuid := (p_value #>> '{}')::uuid;
  return v_uuid is not null;
exception when others then
  return false;
end;
$$;

create or replace function private.awn_validate_profile_data_v2(p_profile_data jsonb)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_transaction jsonb;
  v_kind text;
  v_id text;
  v_amount numeric;
  v_cash numeric := 0;
  v_accounts jsonb := '{}'::jsonb;
  v_cards jsonb := '{}'::jsonb;
  v_card_limits jsonb := '{}'::jsonb;
  v_debit_accounts jsonb := '{}'::jsonb;
  v_source_kind text;
  v_source_id text;
  v_destination_kind text;
  v_destination_id text;
  v_balance numeric;
  v_limit numeric;
begin
  if p_profile_data is null
    or pg_catalog.jsonb_typeof(p_profile_data) is distinct from 'object'
    or p_profile_data->>'version' is distinct from '2'
    or coalesce(p_profile_data->>'currency', '') not in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')
    or pg_catalog.jsonb_typeof(p_profile_data->'onboarding') is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_profile_data->'incomeSources') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_profile_data->'accounts') is distinct from 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_profile_data->'debitCards', '[]'::jsonb)) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_profile_data->'creditCards') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_profile_data->'categoryBudgets') is distinct from 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_profile_data->'monthlyBudgets', '[]'::jsonb)) is distinct from 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_profile_data->'customCategories', '[]'::jsonb)) is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_profile_data->'savingsGoals') is distinct from 'array'
    or pg_catalog.jsonb_typeof(p_profile_data->'transactions') is distinct from 'array'
    or pg_catalog.octet_length(p_profile_data::text) > 5242880
    or not private.awn_jsonb_is_timestamp(p_profile_data->'createdAt')
    or not private.awn_jsonb_is_timestamp(p_profile_data->'updatedAt')
    or not private.awn_jsonb_is_integer_between(p_profile_data#>'{onboarding,currentStep}', 0, 6)
    or pg_catalog.jsonb_typeof(p_profile_data#>'{onboarding,completed}') is distinct from 'boolean'
  then
    raise exception using errcode = 'P0001', message = 'invalid_financial_profile';
  end if;

  if p_profile_data ? 'country' and not private.awn_jsonb_is_trimmed_text(p_profile_data->'country', 200)
    or p_profile_data ? 'budgetStartDay' and not private.awn_jsonb_is_integer_between(p_profile_data->'budgetStartDay', 1, 28)
    or p_profile_data ? 'usualMonthlyIncome' and not private.awn_jsonb_is_integer_between(p_profile_data->'usualMonthlyIncome', 0, 9007199254740991)
    or p_profile_data ? 'monthlySavingsGuidance' and not private.awn_jsonb_is_integer_between(p_profile_data->'monthlySavingsGuidance', 0, 9007199254740991)
    or p_profile_data ? 'monthlyBudget' and not private.awn_jsonb_is_integer_between(p_profile_data->'monthlyBudget', 1, 9007199254740991)
    or p_profile_data ? 'cashBalance' and not private.awn_jsonb_is_integer_between(p_profile_data->'cashBalance', 0, 9007199254740991)
  then
    raise exception using errcode = 'P0001', message = 'invalid_financial_profile';
  end if;

  -- Entity IDs are stable references. They need not be UUIDs because older local
  -- profiles used collision-resistant text IDs, but each collection must be unique.
  if exists (
    select 1
    from (
      select 'incomeSources' as entity_kind, value from pg_catalog.jsonb_array_elements(p_profile_data->'incomeSources')
      union all select 'accounts', value from pg_catalog.jsonb_array_elements(p_profile_data->'accounts')
      union all select 'debitCards', value from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'debitCards', '[]'::jsonb))
      union all select 'creditCards', value from pg_catalog.jsonb_array_elements(p_profile_data->'creditCards')
      union all select 'categoryBudgets', value from pg_catalog.jsonb_array_elements(p_profile_data->'categoryBudgets')
      union all select 'savingsGoals', value from pg_catalog.jsonb_array_elements(p_profile_data->'savingsGoals')
    ) as entity
    where pg_catalog.jsonb_typeof(entity.value) is distinct from 'object'
      or not private.awn_jsonb_is_trimmed_text(entity.value->'id', 200)
      or not private.awn_jsonb_is_trimmed_text(entity.value->'name', 200)
  ) or exists (
    select 1
    from (
      select 'incomeSources' as entity_kind, value->>'id' as entity_id from pg_catalog.jsonb_array_elements(p_profile_data->'incomeSources')
      union all select 'accounts', value->>'id' from pg_catalog.jsonb_array_elements(p_profile_data->'accounts')
      union all select 'debitCards', value->>'id' from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'debitCards', '[]'::jsonb))
      union all select 'creditCards', value->>'id' from pg_catalog.jsonb_array_elements(p_profile_data->'creditCards')
      union all select 'categoryBudgets', value->>'id' from pg_catalog.jsonb_array_elements(p_profile_data->'categoryBudgets')
      union all select 'savingsGoals', value->>'id' from pg_catalog.jsonb_array_elements(p_profile_data->'savingsGoals')
    ) as identity
    group by identity.entity_kind, identity.entity_id
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_financial_entity';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_profile_data->'incomeSources') loop
    if not private.awn_jsonb_is_integer_between(v_item->'amount', 0, 9007199254740991)
      or not private.awn_jsonb_is_integer_between(v_item->'day', 1, 31)
    then raise exception using errcode = 'P0001', message = 'invalid_income_source'; end if;
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_profile_data->'accounts') loop
    if coalesce(v_item->>'type', '') not in ('current', 'savings', 'cash')
      or not private.awn_jsonb_is_integer_between(v_item->'balance', 0, 9007199254740991)
      or v_item ? 'country' and not private.awn_jsonb_is_trimmed_text(v_item->'country', 200)
      or v_item ? 'currency' and coalesce(v_item->>'currency', '') not in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')
      or v_item ? 'lastFour' and (pg_catalog.jsonb_typeof(v_item->'lastFour') is distinct from 'string' or v_item->>'lastFour' <> '' and v_item->>'lastFour' !~ '^\d{4}$')
      or v_item ? 'purpose' and (pg_catalog.jsonb_typeof(v_item->'purpose') is distinct from 'string' or v_item->>'purpose' <> '' and not private.awn_jsonb_is_trimmed_text(v_item->'purpose', 30))
    then raise exception using errcode = 'P0001', message = 'invalid_account'; end if;
    v_accounts := v_accounts || pg_catalog.jsonb_build_object(v_item->>'id', v_item->'balance');
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'debitCards', '[]'::jsonb)) loop
    if not private.awn_jsonb_is_trimmed_text(v_item->'country', 200)
      or coalesce(v_item->>'currency', '') not in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')
      or v_item ? 'lastFour' and (pg_catalog.jsonb_typeof(v_item->'lastFour') is distinct from 'string' or v_item->>'lastFour' <> '' and v_item->>'lastFour' !~ '^\d{4}$')
      or v_item ? 'purpose' and (pg_catalog.jsonb_typeof(v_item->'purpose') is distinct from 'string' or v_item->>'purpose' <> '' and not private.awn_jsonb_is_trimmed_text(v_item->'purpose', 30))
      or v_item ? 'linkedAccountId' and (
        not private.awn_jsonb_is_trimmed_text(v_item->'linkedAccountId', 200)
        or not v_accounts ? (v_item->>'linkedAccountId')
      )
    then raise exception using errcode = 'P0001', message = 'invalid_debit_card'; end if;
    if v_item ? 'linkedAccountId' then
      if exists (
        select 1 from pg_catalog.jsonb_each_text(v_debit_accounts)
        where value = v_item->>'linkedAccountId'
      ) then raise exception using errcode = 'P0001', message = 'invalid_debit_account_link'; end if;
      v_debit_accounts := v_debit_accounts || pg_catalog.jsonb_build_object(v_item->>'id', v_item->>'linkedAccountId');
    end if;
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_profile_data->'creditCards') loop
    if not private.awn_jsonb_is_integer_between(v_item->'limit', 1, 9007199254740991)
      or not private.awn_jsonb_is_integer_between(v_item->'owed', 0, 9007199254740991)
      or (v_item->>'owed')::numeric > (v_item->>'limit')::numeric
      or not private.awn_jsonb_is_integer_between(v_item->'dueDay', 1, 31)
      or v_item ? 'country' and not private.awn_jsonb_is_trimmed_text(v_item->'country', 200)
      or v_item ? 'currency' and coalesce(v_item->>'currency', '') not in ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'RSD')
      or v_item ? 'lastFour' and (pg_catalog.jsonb_typeof(v_item->'lastFour') is distinct from 'string' or v_item->>'lastFour' <> '' and v_item->>'lastFour' !~ '^\d{4}$')
      or v_item ? 'purpose' and (pg_catalog.jsonb_typeof(v_item->'purpose') is distinct from 'string' or v_item->>'purpose' <> '' and not private.awn_jsonb_is_trimmed_text(v_item->'purpose', 30))
    then raise exception using errcode = 'P0001', message = 'invalid_credit_card'; end if;
    v_cards := v_cards || pg_catalog.jsonb_build_object(v_item->>'id', v_item->'owed');
    v_card_limits := v_card_limits || pg_catalog.jsonb_build_object(v_item->>'id', v_item->'limit');
  end loop;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_profile_data->'categoryBudgets') loop
    if not private.awn_jsonb_is_integer_between(v_item->'limit', 0, 9007199254740991)
      or v_item ? 'month' and not private.awn_jsonb_is_month(v_item->'month')
    then raise exception using errcode = 'P0001', message = 'invalid_category_budget'; end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'monthlyBudgets', '[]'::jsonb)) as item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or not private.awn_jsonb_is_month(item->'month')
      or not private.awn_jsonb_is_integer_between(item->'limit', 1, 9007199254740991)
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'monthlyBudgets', '[]'::jsonb)) as item
    group by item->>'month' having count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'invalid_monthly_budget'; end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'customCategories', '[]'::jsonb)) as item
    where not private.awn_jsonb_is_trimmed_text(item, 60)
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(p_profile_data->'customCategories', '[]'::jsonb)) as item
    group by pg_catalog.lower(item #>> '{}') having count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'invalid_custom_category'; end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_profile_data->'savingsGoals') loop
    if not private.awn_jsonb_is_integer_between(v_item->'target', 1, 9007199254740991)
      or not private.awn_jsonb_is_integer_between(v_item->'saved', 0, 9007199254740991)
      or (v_item->>'saved')::numeric > (v_item->>'target')::numeric
      or not private.awn_jsonb_is_integer_between(v_item->'contribution', 0, 9007199254740991)
      or not private.awn_jsonb_is_integer_between(v_item->'priority', 1, 5)
      or v_item ? 'startDate' and not private.awn_jsonb_is_date(v_item->'startDate')
      or v_item ? 'targetDate' and not private.awn_jsonb_is_date(v_item->'targetDate')
      or v_item ? 'startDate' and v_item ? 'targetDate' and v_item->>'targetDate' < v_item->>'startDate'
    then raise exception using errcode = 'P0001', message = 'invalid_savings_goal'; end if;
  end loop;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_profile_data->'transactions') as item
    where pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or not private.awn_jsonb_is_trimmed_text(item->'id', 200)
  ) or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_profile_data->'transactions') as item
    group by item->>'id' having count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'invalid_transaction_identity'; end if;

  -- Validate transaction shapes and all cross-entity references before replay.
  for v_transaction in
    select value from pg_catalog.jsonb_array_elements(p_profile_data->'transactions')
  loop
    v_kind := v_transaction->>'type';
    if coalesce(v_kind, '') not in ('income', 'expense', 'transfer', 'card-payment')
      or not private.awn_jsonb_is_integer_between(v_transaction->'amount', 1, 9007199254740991)
      or not private.awn_jsonb_is_date(v_transaction->'date')
      or not private.awn_jsonb_is_timestamp(v_transaction->'createdAt')
      or not private.awn_jsonb_is_timestamp(v_transaction->'updatedAt')
      or v_transaction ? 'note' and (pg_catalog.jsonb_typeof(v_transaction->'note') is distinct from 'string' or pg_catalog.length(v_transaction->>'note') > 1000)
    then raise exception using errcode = 'P0001', message = 'invalid_transaction'; end if;

    if v_transaction ? 'import' then
      v_item := v_transaction->'import';
      if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
        or v_item->>'origin' is distinct from 'sms'
        or v_item->>'bank' is distinct from 'fab'
        or not private.awn_jsonb_is_trimmed_text(v_item->'messageType', 100)
        or not private.awn_jsonb_is_trimmed_text(v_item->'fingerprint', 200)
        or v_item ? 'observedBalanceAfter' and not private.awn_jsonb_is_integer_between(v_item->'observedBalanceAfter', 0, 9007199254740991)
      then raise exception using errcode = 'P0001', message = 'invalid_transaction_import'; end if;
    end if;

    if v_kind = 'income' then
      if v_transaction ? 'incomeSourceId' and (
          not private.awn_jsonb_is_trimmed_text(v_transaction->'incomeSourceId', 200)
          or not exists (select 1 from pg_catalog.jsonb_array_elements(p_profile_data->'incomeSources') as source where source->>'id' = v_transaction->>'incomeSourceId')
        )
        or v_transaction ? 'incomeSourceName' and not private.awn_jsonb_is_trimmed_text(v_transaction->'incomeSourceName', 200)
        or v_transaction ? 'destinationKind' and coalesce(v_transaction->>'destinationKind', '') not in ('cash', 'account')
        or v_transaction ? 'destinationId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'destinationId', 200)
        or v_transaction ? 'destinationAccountId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'destinationAccountId', 200)
      then raise exception using errcode = 'P0001', message = 'invalid_income_transaction'; end if;
      if v_transaction ? 'destinationKind' then
        if v_transaction->>'destinationKind' = 'account' and (
          not v_transaction ? 'destinationId' or not v_accounts ? (v_transaction->>'destinationId')
        ) or v_transaction->>'destinationKind' = 'cash' and v_transaction ? 'destinationId' then
          raise exception using errcode = 'P0001', message = 'invalid_income_destination';
        end if;
      elsif v_transaction ? 'destinationAccountId' and not v_accounts ? (v_transaction->>'destinationAccountId') then
        raise exception using errcode = 'P0001', message = 'invalid_income_destination';
      end if;

    elsif v_kind = 'expense' then
      if not private.awn_jsonb_is_trimmed_text(v_transaction->'category', 200)
        or v_transaction ? 'sourceKind' and coalesce(v_transaction->>'sourceKind', '') not in ('cash', 'account', 'debit', 'credit')
        or v_transaction ? 'sourceId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'sourceId', 200)
        or v_transaction ? 'accountId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'accountId', 200)
        or v_transaction ? 'cardId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'cardId', 200)
      then raise exception using errcode = 'P0001', message = 'invalid_expense_transaction'; end if;
      if v_transaction ? 'sourceKind' then
        if v_transaction->>'sourceKind' = 'cash' and v_transaction ? 'sourceId'
          or v_transaction->>'sourceKind' = 'account' and (not v_transaction ? 'sourceId' or not v_accounts ? (v_transaction->>'sourceId'))
          or v_transaction->>'sourceKind' = 'debit' and (not v_transaction ? 'sourceId' or not v_debit_accounts ? (v_transaction->>'sourceId'))
          or v_transaction->>'sourceKind' = 'credit' and (not v_transaction ? 'sourceId' or not v_cards ? (v_transaction->>'sourceId'))
        then raise exception using errcode = 'P0001', message = 'invalid_expense_source'; end if;
      elsif v_transaction ? 'accountId' then
        if not v_accounts ? (v_transaction->>'accountId') then raise exception using errcode = 'P0001', message = 'invalid_expense_source'; end if;
      elsif v_transaction ? 'cardId' then
        if not v_cards ? (v_transaction->>'cardId') then raise exception using errcode = 'P0001', message = 'invalid_expense_source'; end if;
      end if;
      if v_transaction ? 'householdBudget' then
        v_item := v_transaction->'householdBudget';
        if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
          or pg_catalog.jsonb_typeof(v_item->'included') is distinct from 'boolean'
          or (v_item->>'included')::boolean is distinct from true
          or not private.awn_jsonb_is_uuid(v_item->'householdId')
          or not private.awn_jsonb_is_trimmed_text(v_item->'category', 60)
        then raise exception using errcode = 'P0001', message = 'invalid_household_budget_mapping'; end if;
      end if;

    elsif v_kind = 'transfer' then
      if v_transaction ? 'sourceKind' and coalesce(v_transaction->>'sourceKind', '') not in ('cash', 'account')
        or v_transaction ? 'destinationKind' and coalesce(v_transaction->>'destinationKind', '') not in ('cash', 'account', 'credit')
        or v_transaction ? 'sourceId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'sourceId', 200)
        or v_transaction ? 'destinationId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'destinationId', 200)
        or v_transaction ? 'sourceAccountId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'sourceAccountId', 200)
        or v_transaction ? 'destinationAccountId' and not private.awn_jsonb_is_trimmed_text(v_transaction->'destinationAccountId', 200)
      then raise exception using errcode = 'P0001', message = 'invalid_transfer_transaction'; end if;
      if v_transaction ? 'sourceKind' and v_transaction ? 'destinationKind' then
        if v_transaction->>'sourceKind' = 'cash' and v_transaction ? 'sourceId'
          or v_transaction->>'sourceKind' = 'account' and (not v_transaction ? 'sourceId' or not v_accounts ? (v_transaction->>'sourceId'))
          or v_transaction->>'destinationKind' = 'cash' and v_transaction ? 'destinationId'
          or v_transaction->>'destinationKind' = 'account' and (not v_transaction ? 'destinationId' or not v_accounts ? (v_transaction->>'destinationId'))
          or v_transaction->>'destinationKind' = 'credit' and (not v_transaction ? 'destinationId' or not v_cards ? (v_transaction->>'destinationId'))
        then raise exception using errcode = 'P0001', message = 'invalid_transfer_endpoint'; end if;
      elsif not v_transaction ? 'sourceAccountId' or not v_transaction ? 'destinationAccountId'
        or not v_accounts ? (v_transaction->>'sourceAccountId') or not v_accounts ? (v_transaction->>'destinationAccountId')
      then raise exception using errcode = 'P0001', message = 'invalid_transfer_endpoint'; end if;

    else
      if not private.awn_jsonb_is_trimmed_text(v_transaction->'payingAccountId', 200)
        or not private.awn_jsonb_is_trimmed_text(v_transaction->'receivingCardId', 200)
        or not v_accounts ? (v_transaction->>'payingAccountId')
        or not v_cards ? (v_transaction->>'receivingCardId')
      then raise exception using errcode = 'P0001', message = 'invalid_card_payment'; end if;
    end if;
  end loop;

  -- Replay the canonical ledger in the same deterministic order as the client.
  -- This prevents a syntactically valid snapshot from persisting impossible cash,
  -- account, or credit-card chronology.
  if p_profile_data ? 'cashBalance' then v_cash := (p_profile_data->>'cashBalance')::numeric; end if;
  for v_transaction in
    select value
    from pg_catalog.jsonb_array_elements(p_profile_data->'transactions')
    order by value->>'date', value->>'createdAt', value->>'id'
  loop
    v_kind := v_transaction->>'type';
    v_amount := (v_transaction->>'amount')::numeric;
    v_source_kind := null;
    v_source_id := null;
    v_destination_kind := null;
    v_destination_id := null;

    if v_kind = 'income' then
      if v_transaction ? 'destinationKind' then
        v_destination_kind := v_transaction->>'destinationKind';
        v_destination_id := v_transaction->>'destinationId';
      elsif v_transaction ? 'destinationAccountId' then
        v_destination_kind := 'account';
        v_destination_id := v_transaction->>'destinationAccountId';
      end if;
      if v_destination_kind = 'cash' then v_cash := v_cash + v_amount;
      elsif v_destination_kind = 'account' then
        v_balance := (v_accounts->>v_destination_id)::numeric + v_amount;
        if v_balance > 9007199254740991 then raise exception using errcode = 'P0001', message = 'invalid_ledger'; end if;
        v_accounts := pg_catalog.jsonb_set(v_accounts, array[v_destination_id], pg_catalog.to_jsonb(v_balance), false);
      end if;

    elsif v_kind = 'expense' then
      if v_transaction ? 'sourceKind' then
        v_source_kind := v_transaction->>'sourceKind';
        v_source_id := v_transaction->>'sourceId';
      elsif v_transaction ? 'accountId' then
        v_source_kind := 'account'; v_source_id := v_transaction->>'accountId';
      elsif v_transaction ? 'cardId' then
        v_source_kind := 'credit'; v_source_id := v_transaction->>'cardId';
      end if;
      if v_source_kind = 'cash' then v_cash := v_cash - v_amount;
      elsif v_source_kind = 'account' then
        v_balance := (v_accounts->>v_source_id)::numeric - v_amount;
        v_accounts := pg_catalog.jsonb_set(v_accounts, array[v_source_id], pg_catalog.to_jsonb(v_balance), false);
      elsif v_source_kind = 'debit' then
        v_source_id := v_debit_accounts->>v_source_id;
        v_balance := (v_accounts->>v_source_id)::numeric - v_amount;
        v_accounts := pg_catalog.jsonb_set(v_accounts, array[v_source_id], pg_catalog.to_jsonb(v_balance), false);
      elsif v_source_kind = 'credit' then
        v_balance := (v_cards->>v_source_id)::numeric + v_amount;
        if v_balance > (v_card_limits->>v_source_id)::numeric then raise exception using errcode = 'P0001', message = 'invalid_ledger'; end if;
        v_cards := pg_catalog.jsonb_set(v_cards, array[v_source_id], pg_catalog.to_jsonb(v_balance), false);
      end if;

    elsif v_kind = 'transfer' then
      if v_transaction ? 'sourceKind' and v_transaction ? 'destinationKind' then
        v_source_kind := v_transaction->>'sourceKind'; v_source_id := v_transaction->>'sourceId';
        v_destination_kind := v_transaction->>'destinationKind'; v_destination_id := v_transaction->>'destinationId';
      else
        v_source_kind := 'account'; v_source_id := v_transaction->>'sourceAccountId';
        v_destination_kind := 'account'; v_destination_id := v_transaction->>'destinationAccountId';
      end if;
      if v_source_kind = v_destination_kind and coalesce(v_source_id, '') = coalesce(v_destination_id, '') then
        raise exception using errcode = 'P0001', message = 'invalid_ledger';
      end if;
      if v_source_kind = 'cash' then v_cash := v_cash - v_amount;
      else
        v_balance := (v_accounts->>v_source_id)::numeric - v_amount;
        v_accounts := pg_catalog.jsonb_set(v_accounts, array[v_source_id], pg_catalog.to_jsonb(v_balance), false);
      end if;
      if v_destination_kind = 'cash' then v_cash := v_cash + v_amount;
      elsif v_destination_kind = 'account' then
        v_balance := (v_accounts->>v_destination_id)::numeric + v_amount;
        if v_balance > 9007199254740991 then raise exception using errcode = 'P0001', message = 'invalid_ledger'; end if;
        v_accounts := pg_catalog.jsonb_set(v_accounts, array[v_destination_id], pg_catalog.to_jsonb(v_balance), false);
      else
        v_balance := (v_cards->>v_destination_id)::numeric - v_amount;
        v_cards := pg_catalog.jsonb_set(v_cards, array[v_destination_id], pg_catalog.to_jsonb(v_balance), false);
      end if;

    else
      v_source_id := v_transaction->>'payingAccountId';
      v_destination_id := v_transaction->>'receivingCardId';
      v_accounts := pg_catalog.jsonb_set(v_accounts, array[v_source_id], pg_catalog.to_jsonb((v_accounts->>v_source_id)::numeric - v_amount), false);
      v_cards := pg_catalog.jsonb_set(v_cards, array[v_destination_id], pg_catalog.to_jsonb((v_cards->>v_destination_id)::numeric - v_amount), false);
    end if;

    if v_cash < 0 or v_cash > 9007199254740991
      or exists (select 1 from pg_catalog.jsonb_each_text(v_accounts) where value::numeric < 0 or value::numeric > 9007199254740991)
      or exists (select 1 from pg_catalog.jsonb_each_text(v_cards) where value::numeric < 0 or value::numeric > 9007199254740991)
    then raise exception using errcode = 'P0001', message = 'invalid_ledger'; end if;
  end loop;
end;
$$;

-- Fail the migration transaction before replacing the production validator if
-- any stored profile is incompatible. No row is modified by this compatibility scan.
do $$
declare
  v_profile record;
begin
  for v_profile in
    select household_id, profile_data from public.financial_profiles where profile_data is not null
  loop
    begin
      perform private.awn_validate_profile_data_v2(v_profile.profile_data);
    exception when others then
      raise exception 'existing_financial_profile_failed_validation:%:%', v_profile.household_id, sqlerrm;
    end;
  end loop;
end;
$$;

create or replace function private.awn_validate_profile_data(p_profile_data jsonb)
returns void
language sql
immutable
security invoker
set search_path = ''
as $$
  select private.awn_validate_profile_data_v2(p_profile_data)
$$;

alter function private.awn_jsonb_is_integer_between(jsonb, numeric, numeric) owner to postgres;
alter function private.awn_jsonb_is_trimmed_text(jsonb, integer) owner to postgres;
alter function private.awn_jsonb_is_date(jsonb) owner to postgres;
alter function private.awn_jsonb_is_month(jsonb) owner to postgres;
alter function private.awn_jsonb_is_timestamp(jsonb) owner to postgres;
alter function private.awn_jsonb_is_uuid(jsonb) owner to postgres;
alter function private.awn_validate_profile_data_v2(jsonb) owner to postgres;
alter function private.awn_validate_profile_data(jsonb) owner to postgres;

revoke all on function private.awn_jsonb_is_integer_between(jsonb, numeric, numeric) from public, anon, authenticated;
revoke all on function private.awn_jsonb_is_trimmed_text(jsonb, integer) from public, anon, authenticated;
revoke all on function private.awn_jsonb_is_date(jsonb) from public, anon, authenticated;
revoke all on function private.awn_jsonb_is_month(jsonb) from public, anon, authenticated;
revoke all on function private.awn_jsonb_is_timestamp(jsonb) from public, anon, authenticated;
revoke all on function private.awn_jsonb_is_uuid(jsonb) from public, anon, authenticated;
revoke all on function private.awn_validate_profile_data_v2(jsonb) from public, anon, authenticated;
revoke all on function private.awn_validate_profile_data(jsonb) from public, anon, authenticated;

comment on function private.awn_validate_profile_data(jsonb) is
  'Validates the canonical private financial profile snapshot, references, minor-unit values, and chronological ledger before persistence.';
