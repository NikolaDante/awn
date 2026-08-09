-- AWN cloud foundation. Amounts are stored as integer minor units; currency is profile-wide.
create table public.financial_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  local_entity_id text,
  version integer not null default 2 check (version >= 1),
  revision bigint not null default 0 check (revision >= 0),
  currency text not null check (currency in ('AED', 'USD', 'EUR', 'GBP', 'SAR')),
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 5),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id)
);

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_entity_id text not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  expected_amount_minor bigint not null check (expected_amount_minor > 0),
  expected_day smallint not null check (expected_day between 1 and 31),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id),
  unique (user_id, id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_entity_id text not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  account_type text not null check (account_type in ('current', 'savings', 'cash')),
  opening_balance_minor bigint not null default 0 check (opening_balance_minor >= 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id),
  unique (user_id, id)
);

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_entity_id text not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  limit_minor bigint not null check (limit_minor >= 0),
  opening_owed_minor bigint not null default 0 check (opening_owed_minor >= 0 and opening_owed_minor <= limit_minor),
  due_day smallint not null check (due_day between 1 and 31),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id),
  unique (user_id, id)
);

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_entity_id text not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  monthly_limit_minor bigint not null check (monthly_limit_minor > 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id),
  unique (user_id, id)
);

create unique index budget_categories_user_name_idx on public.budget_categories (user_id, lower(name));

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_entity_id text not null,
  name text not null check (length(btrim(name)) between 1 and 160),
  target_minor bigint not null check (target_minor > 0),
  saved_minor bigint not null default 0 check (saved_minor >= 0 and saved_minor <= target_minor),
  monthly_contribution_minor bigint not null default 0 check (monthly_contribution_minor >= 0),
  target_date date,
  priority smallint not null default 1 check (priority between 1 and 3),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id),
  unique (user_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_entity_id text not null,
  idempotency_key uuid not null default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('income', 'expense', 'transfer', 'card-payment')),
  amount_minor bigint not null check (amount_minor > 0),
  transaction_date date not null,
  note text check (length(note) <= 1000),
  income_source_id uuid,
  income_source_name_snapshot text,
  destination_account_id uuid,
  destination_account_name_snapshot text,
  category_id uuid,
  category_name_snapshot text,
  expense_account_id uuid,
  expense_account_name_snapshot text,
  expense_card_id uuid,
  expense_card_name_snapshot text,
  source_account_id uuid,
  source_account_name_snapshot text,
  paying_account_id uuid,
  paying_account_name_snapshot text,
  receiving_card_id uuid,
  receiving_card_name_snapshot text,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_entity_id),
  unique (user_id, idempotency_key),
  foreign key (user_id, income_source_id) references public.income_sources(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, destination_account_id) references public.accounts(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, category_id) references public.budget_categories(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, expense_account_id) references public.accounts(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, expense_card_id) references public.credit_cards(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, source_account_id) references public.accounts(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, paying_account_id) references public.accounts(user_id, id) on delete no action deferrable initially deferred,
  foreign key (user_id, receiving_card_id) references public.credit_cards(user_id, id) on delete no action deferrable initially deferred,
  constraint transactions_expense_payment_source_check check (num_nonnulls(expense_account_id, expense_card_id) <= 1),
  constraint transactions_shape_check check (
    (transaction_type = 'income'
      and category_id is null and expense_account_id is null and expense_card_id is null
      and source_account_id is null and paying_account_id is null and receiving_card_id is null)
    or (transaction_type = 'expense'
      and category_name_snapshot is not null and length(btrim(category_name_snapshot)) between 1 and 160
      and income_source_id is null and destination_account_id is null
      and source_account_id is null and paying_account_id is null and receiving_card_id is null)
    or (transaction_type = 'transfer'
      and source_account_id is not null and destination_account_id is not null
      and source_account_id <> destination_account_id
      and income_source_id is null and category_id is null
      and expense_account_id is null and expense_card_id is null
      and paying_account_id is null and receiving_card_id is null)
    or (transaction_type = 'card-payment'
      and paying_account_id is not null and receiving_card_id is not null
      and income_source_id is null and destination_account_id is null and category_id is null
      and expense_account_id is null and expense_card_id is null and source_account_id is null)
  ),
  constraint transactions_linked_snapshot_check check (
    (income_source_id is null or (income_source_name_snapshot is not null and length(btrim(income_source_name_snapshot)) between 1 and 160))
    and (destination_account_id is null or (destination_account_name_snapshot is not null and length(btrim(destination_account_name_snapshot)) between 1 and 160))
    and (expense_account_id is null or (expense_account_name_snapshot is not null and length(btrim(expense_account_name_snapshot)) between 1 and 160))
    and (expense_card_id is null or (expense_card_name_snapshot is not null and length(btrim(expense_card_name_snapshot)) between 1 and 160))
    and (source_account_id is null or (source_account_name_snapshot is not null and length(btrim(source_account_name_snapshot)) between 1 and 160))
    and (paying_account_id is null or (paying_account_name_snapshot is not null and length(btrim(paying_account_name_snapshot)) between 1 and 160))
    and (receiving_card_id is null or (receiving_card_name_snapshot is not null and length(btrim(receiving_card_name_snapshot)) between 1 and 160))
  )
);

create index transactions_user_date_order_idx on public.transactions (user_id, transaction_date, created_at, id);
create index transactions_user_type_idx on public.transactions (user_id, transaction_type);

create table public.financial_migration_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  migration_identifier text not null check (migration_identifier = btrim(migration_identifier) and length(migration_identifier) between 1 and 160),
  source_profile_local_id text,
  status text not null check (status in ('started', 'completed', 'failed')),
  imported_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, migration_identifier)
);

create table public.financial_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (length(btrim(event_type)) between 1 and 120),
  resource_type text not null check (length(btrim(resource_type)) between 1 and 120),
  created_at timestamptz not null default now()
);

-- The trigger rejects ownership changes even if a future grant or policy is configured incorrectly.
create function public.awn_assign_authenticated_user_id() returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Row ownership cannot be reassigned';
  end if;
  if auth.uid() is null then raise exception 'An authenticated user is required'; end if;
  if new.user_id is null then new.user_id := auth.uid(); end if;
  if new.user_id <> auth.uid() then raise exception 'A row may only belong to the authenticated user'; end if;
  return new;
end;
$$;

create function public.awn_set_updated_at() returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger financial_profiles_assign_user before insert or update on public.financial_profiles for each row execute function public.awn_assign_authenticated_user_id();
create trigger income_sources_assign_user before insert or update on public.income_sources for each row execute function public.awn_assign_authenticated_user_id();
create trigger accounts_assign_user before insert or update on public.accounts for each row execute function public.awn_assign_authenticated_user_id();
create trigger credit_cards_assign_user before insert or update on public.credit_cards for each row execute function public.awn_assign_authenticated_user_id();
create trigger budget_categories_assign_user before insert or update on public.budget_categories for each row execute function public.awn_assign_authenticated_user_id();
create trigger savings_goals_assign_user before insert or update on public.savings_goals for each row execute function public.awn_assign_authenticated_user_id();
create trigger transactions_assign_user before insert or update on public.transactions for each row execute function public.awn_assign_authenticated_user_id();
create trigger financial_migration_records_assign_user before insert or update on public.financial_migration_records for each row execute function public.awn_assign_authenticated_user_id();
create trigger financial_profiles_set_updated_at before update on public.financial_profiles for each row execute function public.awn_set_updated_at();
create trigger income_sources_set_updated_at before update on public.income_sources for each row execute function public.awn_set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.awn_set_updated_at();
create trigger credit_cards_set_updated_at before update on public.credit_cards for each row execute function public.awn_set_updated_at();
create trigger budget_categories_set_updated_at before update on public.budget_categories for each row execute function public.awn_set_updated_at();
create trigger savings_goals_set_updated_at before update on public.savings_goals for each row execute function public.awn_set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.awn_set_updated_at();
create trigger financial_migration_records_set_updated_at before update on public.financial_migration_records for each row execute function public.awn_set_updated_at();

alter table public.financial_profiles enable row level security;
alter table public.income_sources enable row level security;
alter table public.accounts enable row level security;
alter table public.credit_cards enable row level security;
alter table public.budget_categories enable row level security;
alter table public.savings_goals enable row level security;
alter table public.transactions enable row level security;
alter table public.financial_migration_records enable row level security;
alter table public.financial_security_events enable row level security;

-- FORCE ROW LEVEL SECURITY is intentionally omitted. Supabase's table owner and trusted
-- server roles must be able to run controlled migrations and create immutable security
-- events. No service-role credential is present in the AWN application.

create policy "Users select their financial profile" on public.financial_profiles for select to authenticated using (user_id = auth.uid());
create policy "Users insert their financial profile" on public.financial_profiles for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their financial profile" on public.financial_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their financial profile" on public.financial_profiles for delete to authenticated using (user_id = auth.uid());

create policy "Users select their income sources" on public.income_sources for select to authenticated using (user_id = auth.uid());
create policy "Users insert their income sources" on public.income_sources for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their income sources" on public.income_sources for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their income sources" on public.income_sources for delete to authenticated using (user_id = auth.uid());

create policy "Users select their accounts" on public.accounts for select to authenticated using (user_id = auth.uid());
create policy "Users insert their accounts" on public.accounts for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their accounts" on public.accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their accounts" on public.accounts for delete to authenticated using (user_id = auth.uid());

create policy "Users select their credit cards" on public.credit_cards for select to authenticated using (user_id = auth.uid());
create policy "Users insert their credit cards" on public.credit_cards for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their credit cards" on public.credit_cards for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their credit cards" on public.credit_cards for delete to authenticated using (user_id = auth.uid());

create policy "Users select their budget categories" on public.budget_categories for select to authenticated using (user_id = auth.uid());
create policy "Users insert their budget categories" on public.budget_categories for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their budget categories" on public.budget_categories for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their budget categories" on public.budget_categories for delete to authenticated using (user_id = auth.uid());

create policy "Users select their savings goals" on public.savings_goals for select to authenticated using (user_id = auth.uid());
create policy "Users insert their savings goals" on public.savings_goals for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their savings goals" on public.savings_goals for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their savings goals" on public.savings_goals for delete to authenticated using (user_id = auth.uid());

create policy "Users select their transactions" on public.transactions for select to authenticated using (user_id = auth.uid());
create policy "Users insert their transactions" on public.transactions for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their transactions" on public.transactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their transactions" on public.transactions for delete to authenticated using (user_id = auth.uid());

create policy "Users select their migration records" on public.financial_migration_records for select to authenticated using (user_id = auth.uid());
create policy "Users insert their migration records" on public.financial_migration_records for insert to authenticated with check (user_id = auth.uid());
create policy "Users update their migration records" on public.financial_migration_records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users delete their migration records" on public.financial_migration_records for delete to authenticated using (user_id = auth.uid());

create policy "Users select their security events" on public.financial_security_events for select to authenticated using (user_id = auth.uid());

-- Supabase commonly applies broad default grants to exposed schemas. Revoke those
-- explicitly, then expose only owner-scoped CRUD for the financial domain tables.
revoke all on table public.financial_profiles, public.income_sources, public.accounts,
  public.credit_cards, public.budget_categories, public.savings_goals, public.transactions,
  public.financial_migration_records, public.financial_security_events from public, anon, authenticated;

grant select, insert, update, delete on table public.financial_profiles, public.income_sources,
  public.accounts, public.credit_cards, public.budget_categories, public.savings_goals,
  public.transactions to authenticated;

-- Migration records and security events are internal operational data. They have RLS
-- as defense in depth but no direct client grants. Security events are trusted records,
-- not editable or user-submitted audit evidence.

revoke all on function public.awn_assign_authenticated_user_id() from public, anon, authenticated;
revoke all on function public.awn_set_updated_at() from public, anon, authenticated;
