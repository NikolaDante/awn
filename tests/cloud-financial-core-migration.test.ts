import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDirectory = join(root, "supabase/migrations");
const initialName = "20260809000000_initial_financial_foundation.sql";
const repairName = "20260809010000_create_missing_financial_profiles.sql";
const coreName = "20260809020000_cloud_financial_core.sql";
const householdName = "20260822000000_household_financial_persistence.sql";
const initial = readFileSync(join(migrationsDirectory, initialName), "utf8");
const repair = readFileSync(join(migrationsDirectory, repairName), "utf8");
const core = readFileSync(join(migrationsDirectory, coreName), "utf8");

const rpcNames = [
  "awn_update_financial_profile",
  "awn_create_income_source", "awn_update_income_source", "awn_delete_income_source",
  "awn_create_account", "awn_update_account", "awn_delete_account",
  "awn_create_credit_card", "awn_update_credit_card", "awn_delete_credit_card",
  "awn_create_category", "awn_update_category", "awn_delete_category",
  "awn_create_transaction", "awn_update_transaction", "awn_delete_transaction",
];
const deleteRpcNames = [
  "awn_delete_income_source", "awn_delete_account", "awn_delete_credit_card",
  "awn_delete_category", "awn_delete_transaction",
];

function functionDefinition(schema: "public" | "private", name: string) {
  const definition = core.match(new RegExp(`create or replace function ${schema}\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"))?.[0];
  assert.ok(definition, `Missing ${schema}.${name}`);
  return definition;
}

function functionParameters(name: string) {
  const definition = functionDefinition("public", name);
  const parameters = definition.match(new RegExp(`function public\\.${name}\\(([\\s\\S]*?)\\)\\nreturns`, "i"))?.[1];
  assert.notEqual(parameters, undefined, `Missing parameter list for ${name}`);
  return parameters ?? "";
}

test("orders the household persistence migration after the immutable cloud foundation", () => {
  const migrationNames = readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort();
  assert.deepEqual(migrationNames, [initialName, repairName, coreName, householdName]);
  assert.equal(createHash("sha256").update(initial).digest("hex"), "f6a1bd82ea96836e41e05113e58b13e217a4b6a4ea78617b8641ebf25df53964");
  assert.equal(createHash("sha256").update(repair).digest("hex"), "a6b798457e0eb4bfc512b41a73f1130c9291b8627bbc454abb5c5bb4dbec054d");
  assert.doesNotMatch(core, /drop\s+(table|column|constraint)|alter\s+column|truncate/i);
});

test("adds JavaScript-safe upper bounds without replacing existing lower bounds", () => {
  for (const constraint of [
    "income_sources_safe_amount_check", "accounts_safe_opening_balance_check",
    "credit_cards_safe_limit_check", "credit_cards_safe_opening_owed_check",
    "budget_categories_safe_limit_check", "savings_goals_safe_target_check",
    "savings_goals_safe_saved_check", "savings_goals_safe_contribution_check",
    "transactions_safe_amount_check",
  ]) assert.match(core, new RegExp(`add constraint ${constraint} check \\([^;]*9007199254740991\\)`));
  assert.match(initial, /expected_amount_minor bigint not null check \(expected_amount_minor > 0\)/);
  assert.match(initial, /opening_balance_minor bigint not null default 0 check \(opening_balance_minor >= 0\)/);
  assert.match(initial, /amount_minor bigint not null check \(amount_minor > 0\)/);
  assert.doesNotMatch(core, /current_(balance|owed)/i);
});

test("canonicalizes client entity identities and exact transaction reference shapes", () => {
  for (const table of ["income_sources", "accounts", "credit_cards", "budget_categories", "savings_goals", "transactions"]) {
    assert.match(core, new RegExp(`${table}_local_entity_id_check check \\([\\s\\S]*?\\^\\[0-9a-f\\]`));
  }
  const shape = core.match(/add constraint transactions_exact_reference_shape_check check \(([\s\S]*?)\n  \);/)?.[1] ?? "";
  for (const type of ["income", "expense", "transfer", "card-payment"]) assert.match(shape, new RegExp(`transaction_type = '${type}'`));
  for (const snapshot of ["income_source", "destination_account", "expense_account", "expense_card", "source_account", "paying_account", "receiving_card"]) {
    assert.match(shape, new RegExp(`${snapshot}_id is null and ${snapshot}_name_snapshot is null`));
    assert.match(shape, new RegExp(`${snapshot}_id is not null and ${snapshot}_name_snapshot is not null`));
  }
  assert.match(shape, /num_nonnulls\(expense_account_id, expense_card_id\) <= 1/);
  assert.match(shape, /source_account_id <> destination_account_id/);
});

test("indexes every transaction reference access path by owner and reference", () => {
  const references = ["income_source", "destination_account", "category", "expense_account", "expense_card", "source_account", "paying_account", "receiving_card"];
  for (const reference of references) {
    assert.match(core, new RegExp(`create index transactions_${reference}_reference_idx on public\\.transactions \\(user_id, ${reference}_id\\) where ${reference}_id is not null;`));
  }
});

test("exposes the complete narrowly scoped RPC surface without ownership or snapshot inputs", () => {
  for (const name of rpcNames) {
    const definition = functionDefinition("public", name);
    const parameters = functionParameters(name);
    assert.match(definition, /language plpgsql\s+security definer\s+set search_path = ''/);
    assert.match(definition, /private\.awn_lock_financial_profile\(\)/);
    assert.doesNotMatch(parameters, /user_id|snapshot/i);
    assert.doesNotMatch(definition, /set search_path = (?!'')/i);
  }
});

test("derives and locks authenticated ownership before every mutation", () => {
  const lock = functionDefinition("private", "awn_lock_financial_profile");
  assert.match(lock, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(lock, /authentication_required/);
  assert.match(lock, /from public\.financial_profiles[\s\S]*?user_id = v_user_id[\s\S]*?for update/);
  for (const resolver of ["awn_income_source_name", "awn_account_name", "awn_credit_card_name", "awn_category_name"]) {
    const definition = functionDefinition("private", resolver);
    assert.match(definition, /where \w+\.user_id = p_user_id and \w+\.id = p_id/);
    assert.match(definition, /invalid_reference/);
  }
});

test("uses optimistic revisions for updates and deletes and increments updates atomically", () => {
  for (const name of rpcNames.filter((name) => name.includes("update_") || name.includes("delete_"))) {
    assert.match(functionParameters(name), /p_expected_revision bigint/);
    assert.match(functionDefinition("public", name), /revision_conflict/);
  }
  for (const name of rpcNames.filter((name) => name.includes("update_"))) {
    assert.match(functionDefinition("public", name), /revision = \w+\.revision \+ 1/);
  }
});

test("delete RPCs reject null and mismatched expected revisions with null-safe guards", () => {
  for (const name of deleteRpcNames) {
    const definition = functionDefinition("public", name);
    assert.match(
      definition,
      /if v_row\.revision is distinct from p_expected_revision then\s+raise exception using errcode = 'P0001', message = 'revision_conflict';\s+end if;/,
      `${name} must treat a null expected revision as distinct`,
    );
    assert.doesNotMatch(
      definition,
      /v_row\.revision\s*<>\s*p_expected_revision/,
      `${name} must not use null-unsafe expected-revision inequality`,
    );
  }
});

test("transaction deletion verifies its revision-qualified DELETE affected one row", () => {
  const definition = functionDefinition("public", "awn_delete_transaction");
  const deletion = definition.match(/delete from public\.transactions as transaction([\s\S]*?)perform private\.awn_assert_card_ledger_valid/)?.[1] ?? "";
  assert.match(deletion, /transaction\.revision = p_expected_revision/);
  assert.match(deletion, /returning transaction\.\* into v_row;/);
  assert.match(deletion, /if not found then\s+raise exception using errcode = 'P0001', message = 'revision_conflict';\s+end if;/);
});

test("transaction updates reject null expected revisions before reference validation", () => {
  const definition = functionDefinition("public", "awn_update_transaction");
  const guardPosition = definition.indexOf("v_old.revision is distinct from p_expected_revision");
  const referencePosition = definition.indexOf("private.awn_income_source_name");
  assert.notEqual(guardPosition, -1);
  assert.notEqual(referencePosition, -1);
  assert.ok(guardPosition < referencePosition);
  assert.doesNotMatch(definition, /v_old\.revision\s*<>\s*p_expected_revision/);
});

test("makes entity and transaction creation replay-safe without silent mutation", () => {
  for (const name of ["awn_create_income_source", "awn_create_account", "awn_create_credit_card", "awn_create_category"]) {
    const definition = functionDefinition("public", name);
    assert.match(functionParameters(name), /p_local_entity_id text/);
    assert.match(definition, /local_entity_id = p_local_entity_id/);
    assert.match(definition, /creation_conflict/);
    assert.doesNotMatch(definition, /idempotency_conflict/);
    assert.match(definition, /return v_row/);
    assert.doesNotMatch(definition, /on conflict[\s\S]*do update/i);
  }
  const transaction = functionDefinition("public", "awn_create_transaction");
  assert.match(functionParameters("awn_create_transaction"), /p_idempotency_key uuid/);
  assert.match(transaction, /idempotency_key = p_idempotency_key/);
  assert.match(transaction, /same canonical payload|idempotency_conflict|is not distinct from/);
  assert.match(transaction, /p_transaction_type <> 'expense' or p_category_id is not null[\s\S]*?v_row\.category_name_snapshot = v_category_name/);
  assert.doesNotMatch(transaction, /on conflict[\s\S]*do update/i);
});

test("uses the transaction-specific conflict contract for changed idempotent replays", () => {
  const transaction = functionDefinition("public", "awn_create_transaction");
  const idempotencyReplay = transaction.match(
    /select \* into v_row from public\.transactions as transaction\s+where transaction\.user_id = v_user_id and transaction\.idempotency_key = p_idempotency_key;([\s\S]*?)\n  if exists \(select 1 from public\.transactions as transaction\s+where transaction\.user_id = v_user_id and transaction\.local_entity_id = p_local_entity_id\)/,
  )?.[1] ?? "";

  assert.match(idempotencyReplay, /if found then/);
  assert.match(idempotencyReplay, /then\s+return v_row;\s+end if;/);
  assert.match(
    idempotencyReplay,
    /raise exception using errcode = 'P0001', message = 'idempotency_conflict';/,
  );
  assert.doesNotMatch(idempotencyReplay, /creation_conflict/);
  assert.doesNotMatch(idempotencyReplay, /insert into|update public\.transactions/i);

  const localEntityConflict = transaction.match(
    /if exists \(select 1 from public\.transactions as transaction\s+where transaction\.user_id = v_user_id and transaction\.local_entity_id = p_local_entity_id\) then([\s\S]*?)end if;/,
  )?.[1] ?? "";
  assert.match(localEntityConflict, /errcode = 'P0001', message = 'creation_conflict'/);
});

test("generates snapshots from owner-filtered database records and preserves unchanged history", () => {
  const create = functionDefinition("public", "awn_create_transaction");
  const update = functionDefinition("public", "awn_update_transaction");
  for (const resolver of ["awn_income_source_name", "awn_account_name", "awn_credit_card_name", "awn_category_name"]) {
    assert.match(`${create}\n${update}`, new RegExp(`private\\.${resolver}\\(v_user_id, p_`));
  }
  assert.match(update, /when p_income_source_id = v_old\.income_source_id[\s\S]*?then v_old\.income_source_name_snapshot/);
  assert.match(update, /category_name_snapshot = v_category_name/);
  assert.match(update, /expense_account_name_snapshot = v_expense_account_name/);
  assert.match(update, /receiving_card_name_snapshot = v_receiving_card_name/);
});

test("validates complete deterministic card-ledger history after every relevant mutation", () => {
  const validator = functionDefinition("private", "awn_assert_card_ledger_valid");
  assert.match(validator, /opening_owed_minor \+ pg_catalog\.sum/);
  assert.match(validator, /order by transaction\.transaction_date, transaction\.created_at, transaction\.id/);
  assert.match(validator, /rows between unbounded preceding and current row/);
  assert.match(validator, /chronological_owed_minor < 0/);
  assert.match(validator, /negative_card_debt/);
  assert.doesNotMatch(validator, /limit_minor/);
  for (const name of ["awn_update_credit_card", "awn_create_transaction", "awn_update_transaction", "awn_delete_transaction"]) {
    assert.match(functionDefinition("public", name), /private\.awn_assert_card_ledger_valid\(v_user_id\)/);
  }
});

test("validates dates, ledger shapes, amounts, and deliberate unlinked activity", () => {
  const validator = functionDefinition("private", "awn_validate_transaction_input");
  assert.match(validator, /p_transaction_date > current_date/);
  assert.match(validator, /private\.awn_validate_positive_money\(p_amount_minor\)/);
  assert.match(validator, /p_transaction_type = 'income'/);
  assert.doesNotMatch(validator.match(/p_transaction_type = 'income'([\s\S]*?)elsif/)?.[1] ?? "", /p_income_source_id is null|p_destination_account_id is null/);
  assert.match(validator, /p_category_id is null and p_category_name is null/);
  assert.match(validator, /num_nonnulls\(p_expense_account_id, p_expense_card_id\) > 1/);
  assert.match(validator, /p_source_account_id = p_destination_account_id/);
});

test("protects referenced entities while retaining whole-user cascades", () => {
  for (const name of ["awn_delete_income_source", "awn_delete_account", "awn_delete_credit_card", "awn_delete_category"]) {
    assert.match(functionDefinition("public", name), /from public\.transactions[\s\S]*?entity_referenced/);
  }
  for (const table of ["income_sources", "accounts", "credit_cards", "budget_categories", "transactions"]) {
    assert.match(initial, new RegExp(`create table public\\.${table} \\([\\s\\S]*?user_id uuid not null references auth\\.users\\(id\\) on delete cascade`));
  }
});

test("revokes direct writes, preserves RLS-scoped reads, and grants only authenticated RPC execution", () => {
  const directRevoke = core.match(/revoke insert, update, delete on table ([\s\S]*?)\s+from authenticated;/)?.[1] ?? "";
  const selectGrant = core.match(/grant select on table ([\s\S]*?) to authenticated;/)?.[1] ?? "";
  for (const table of ["financial_profiles", "income_sources", "accounts", "credit_cards", "budget_categories", "transactions"]) {
    assert.match(directRevoke, new RegExp(`public\\.${table}`));
    assert.match(selectGrant, new RegExp(`public\\.${table}`));
    assert.match(initial, new RegExp(`on public\\.${table} for select to authenticated using \\(user_id = auth\\.uid\\(\\)\\)`));
  }
  assert.match(core, /revoke all on all functions in schema private from public, anon, authenticated/);
  for (const name of rpcNames) {
    assert.match(core, new RegExp(`alter function public\\.${name}\\([^;]+\\) owner to postgres;`));
    assert.match(core, new RegExp(`revoke all on function public\\.${name}\\([^;]+\\) from public, anon, authenticated;`));
    assert.match(core, new RegExp(`grant execute on function public\\.${name}\\([^;]+\\) to authenticated;`));
  }
});

test("uses fully qualified data access and contains no privileged credential or sensitive logging", () => {
  for (const name of rpcNames) {
    const definition = functionDefinition("public", name);
    assert.doesNotMatch(definition, /^\s*(?:from|join|insert into|update|delete from)\s+(?!(?:public|private|pg_catalog)\.)[a-z_]/im, name);
  }
  assert.doesNotMatch(core, /SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_|postgres(?:ql)?:\/\/|console\.|raise\s+(?:notice|warning|log|debug)/i);
});
