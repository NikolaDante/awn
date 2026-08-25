import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { budgetTemplateAmounts, responsibilitySplit, splitMinorUnits, suggestedBudgetBucket } from "../lib/budget-guide.ts";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("budget templates separate spending from savings exactly", () => {
  assert.deepEqual(budgetTemplateAmounts(1_000_000, "balanced"), { essentials: 500_000, lifestyle: 300_000, savings: 200_000, spending: 800_000, percentages: { label: "Balanced", essentials: 50, lifestyle: 30, savings: 20 } });
  assert.equal(budgetTemplateAmounts(1_000_000, "savings-first")?.spending, 700_000);
  assert.equal(budgetTemplateAmounts(1_000_000, "flexible")?.spending, 900_000);
  assert.equal(budgetTemplateAmounts(1_000_000, "custom", { essentials: 40, lifestyle: 20, savings: 39 }), null);
});

test("minor-unit and responsibility splits are exact and deterministic", () => {
  assert.deepEqual(splitMinorUnits(101, [50, 50]), [50, 51]);
  assert.deepEqual(responsibilitySplit(101, "equal"), [50, 51]);
  assert.deepEqual(responsibilitySplit(100_000, "custom", 70_000), [70_000, 30_000]);
});

test("category guidance is deterministic without adding a taxonomy", () => {
  assert.equal(suggestedBudgetBucket("Rent"), "essentials");
  assert.equal(suggestedBudgetBucket("Dining Out"), "lifestyle");
  assert.equal(suggestedBudgetBucket("A custom necessity"), "essentials");
});

test("guide stays client-side until its accepted draft enters the existing save flow", () => {
  const guide = source("components/budget-guide.tsx");
  const privateDialog = source("components/manage-monthly-budget-dialog.tsx");
  assert.doesNotMatch(guide, /createClient|fetch\(|\.rpc\(/);
  assert.match(guide, /Nothing has been saved yet/);
  assert.match(privateDialog, /accept=\{\(draft\).*setOverall/);
  assert.match(privateDialog, /replaceManagedBudgetSnapshot/);
});

test("responsibility RLS, ownership transfer semantics, and outsider denial are server enforced", () => {
  const migration = source("supabase/migrations/20260825010000_shared_budget_responsibilities.sql");
  const repair = source("supabase/migrations/20260825020000_shared_budget_responsibility_save_repair.sql");
  assert.match(migration, /Members select shared budget responsibilities[\s\S]*awn_is_household_member/);
  assert.match(migration, /awn_save_shared_budget[\s\S]*awn_is_household_owner/);
  assert.match(migration, /count\(\*\).*<>2/);
  assert.match(migration, /count\(distinct member->>'userId'\).*<>2/);
  assert.match(migration, /sum\(\(member->>'amount'\)::bigint\).*<>v_amount/);
  assert.match(repair, /select 1 from jsonb_array_elements\(p_allocations\)[\s\S]*group by lower/i);
});
