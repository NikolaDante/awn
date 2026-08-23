-- AWN FAB SMS Import v1: durable, Household-scoped duplicate fingerprints.
-- The authoritative financial ledger remains financial_profiles.profile_data. This
-- lightweight table is a tombstone/history index so deleting or editing a transaction
-- never makes the same pasted bank message importable again by accident.

create table public.financial_import_fingerprints (
  household_id uuid not null references public.households(id) on delete cascade,
  fingerprint text not null check (fingerprint ~ '^fab-v1-[0-9a-f]{16}$'),
  bank text not null check (bank = 'fab'),
  message_type text not null check (message_type in (
    'salary_credit', 'debit_card_purchase', 'outward_remittance',
    'inward_remittance', 'atm_cash_withdrawal'
  )),
  transaction_id text not null check (length(transaction_id) between 1 and 160),
  observed_balance_minor bigint check (observed_balance_minor between 0 and 9007199254740991),
  imported_by_user_id uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  primary key (household_id, fingerprint)
);

create index financial_import_fingerprints_transaction_idx
  on public.financial_import_fingerprints (household_id, transaction_id);

alter table public.financial_import_fingerprints enable row level security;

create policy "Members select household import fingerprints"
  on public.financial_import_fingerprints for select to authenticated
  using (private.awn_is_household_member(household_id));

revoke all on table public.financial_import_fingerprints from public, anon, authenticated;
grant select on table public.financial_import_fingerprints to authenticated;

create or replace function public.awn_import_financial_transactions(
  p_household_id uuid,
  p_expected_revision bigint,
  p_profile_data jsonb,
  p_imports jsonb
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
  v_import jsonb;
  v_saved record;
begin
  if v_user_id is null then raise exception using errcode = 'P0001', message = 'authentication_required'; end if;
  if not private.awn_is_household_member(p_household_id, v_user_id) then
    raise exception using errcode = '42501', message = 'household_access_denied';
  end if;
  if jsonb_typeof(p_imports) is distinct from 'array' or jsonb_array_length(p_imports) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'invalid_import_record';
  end if;
  if exists (
    select item->>'fingerprint' from jsonb_array_elements(p_imports) as item
    group by item->>'fingerprint' having item->>'fingerprint' is null or count(*) > 1
  ) then raise exception using errcode = 'P0001', message = 'import_duplicate'; end if;

  for v_import in select value from jsonb_array_elements(p_imports) loop
    if coalesce(v_import->>'bank', '') <> 'fab'
      or coalesce(v_import->>'messageType', '') not in (
        'salary_credit', 'debit_card_purchase', 'outward_remittance',
        'inward_remittance', 'atm_cash_withdrawal'
      )
      or coalesce(v_import->>'fingerprint', '') !~ '^fab-v1-[0-9a-f]{16}$'
      or nullif(v_import->>'transactionId', '') is null
      or v_import ? 'observedBalanceAfter' and (
        jsonb_typeof(v_import->'observedBalanceAfter') is distinct from 'number'
        or (v_import->>'observedBalanceAfter')::numeric < 0
        or (v_import->>'observedBalanceAfter')::numeric > 9007199254740991
        or trunc((v_import->>'observedBalanceAfter')::numeric) <> (v_import->>'observedBalanceAfter')::numeric
      ) then raise exception using errcode = 'P0001', message = 'invalid_import_record'; end if;

    if not exists (
      select 1 from jsonb_array_elements(p_profile_data->'transactions') as transaction_data
      where transaction_data->>'id' = v_import->>'transactionId'
        and transaction_data->'import'->>'origin' = 'sms'
        and transaction_data->'import'->>'bank' = v_import->>'bank'
        and transaction_data->'import'->>'messageType' = v_import->>'messageType'
        and transaction_data->'import'->>'fingerprint' = v_import->>'fingerprint'
    ) then raise exception using errcode = 'P0001', message = 'invalid_import_record'; end if;

    if exists (
      select 1 from public.financial_import_fingerprints as existing
      where existing.household_id = p_household_id and existing.fingerprint = v_import->>'fingerprint'
    ) then raise exception using errcode = 'P0001', message = 'import_duplicate'; end if;
  end loop;

  select saved.* into v_saved
  from public.awn_save_financial_state(p_household_id, p_expected_revision, p_profile_data, null) as saved;

  begin
    insert into public.financial_import_fingerprints (
      household_id, fingerprint, bank, message_type, transaction_id,
      observed_balance_minor, imported_by_user_id
    )
    select p_household_id, item->>'fingerprint', item->>'bank', item->>'messageType',
      item->>'transactionId', case when item ? 'observedBalanceAfter' then (item->>'observedBalanceAfter')::bigint else null end,
      v_user_id
    from jsonb_array_elements(p_imports) as item;
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'import_duplicate';
  end;

  return query select v_saved.household_id, v_saved.profile_data, v_saved.revision,
    v_saved.initialized_at, v_saved.migrated_at;
end;
$$;

alter function public.awn_import_financial_transactions(uuid, bigint, jsonb, jsonb) owner to postgres;
revoke all on function public.awn_import_financial_transactions(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.awn_import_financial_transactions(uuid, bigint, jsonb, jsonb) to authenticated;
