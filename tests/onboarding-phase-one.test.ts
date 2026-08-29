import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { replaceBudgetSnapshot } from "../lib/financial-budget.ts";
import { debitAccountAvailable } from "../lib/financial-institutions.ts";
import { ledgerBalancesAt } from "../lib/financial-ledger.ts";
import { authenticatedFinancialRoute, budgetAllocation, budgetCycle, categoryBudgetValid, normalizeBudgetStartDayInput, normalizeSavingsTargetMonth, parseBudgetStartDayInput, removeOnboardingItem, requestedOnboardingStep, savingsTargetMonth, upsertOnboardingItem } from "../lib/onboarding.ts";
import { isFinancialProfile } from "../lib/financial-storage-core.ts";
import { createFinancialProfile, type Account, type CreditCard, type DebitCard, type SavingsGoal } from "../lib/financial-types.ts";

const root = process.cwd();
const onboardingSource = readFileSync(join(root, "components/onboarding-flow.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const categoryBudgetSource = readFileSync(join(root, "components/category-budget-form.tsx"), "utf8");
const financialItemSource = readFileSync(join(root, "components/financial-item-form.tsx"), "utf8");
const savingsGoalSource = readFileSync(join(root, "components/savings-goal-form.tsx"), "utf8");

test("first login routes incomplete profiles into onboarding and leaves completed users in the app", () => {
  const incomplete = createFinancialProfile();
  assert.equal(authenticatedFinancialRoute(null, "/dashboard"), "/onboarding");
  assert.equal(authenticatedFinancialRoute(incomplete, "/dashboard"), "/onboarding");
  assert.equal(authenticatedFinancialRoute(incomplete, "/onboarding"), null);
  incomplete.onboarding.completed = true;
  assert.equal(authenticatedFinancialRoute(incomplete, "/dashboard"), null);
  assert.equal(authenticatedFinancialRoute(incomplete, "/onboarding"), "/dashboard");
  assert.equal(authenticatedFinancialRoute(incomplete, "/onboarding", true), null);
});

test("stored and linked onboarding steps resume without changing entered profile data", () => {
  const profile = createFinancialProfile();
  const account: Account = { id: "account", name: "Everyday", type: "current", balance: 150000 };
  profile.accounts = upsertOnboardingItem(profile.accounts, account);
  profile.onboarding.currentStep = 4;
  const before = structuredClone(profile.accounts);
  assert.equal(requestedOnboardingStep(null, profile.onboarding.currentStep), 4);
  assert.equal(requestedOnboardingStep("accounts", 4), 2);
  assert.equal(requestedOnboardingStep("income", 4), 1);
  assert.deepEqual(profile.accounts, before);
});

test("onboarding step headings keep programmatic focus without a visible halo", () => {
  assert.match(onboardingSource, /heading\.current\?\.focus\(\)/);
  assert.match(onboardingSource, /<h1 tabIndex=\{-1\} ref=\{heading\}>/);
  const focusBlock = css.match(/\.onboarding-card h1:focus \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(focusBlock, /outline:0/);
  assert.match(focusBlock, /box-shadow:none/);
  assert.doesNotMatch(focusBlock, /rgba\(183,178,255/);
});

test("optional add forms only persist on save and expose a cancel path", () => {
  const original: Account[] = [];
  const unfinished: Account = { id: "draft", name: "", type: "current", balance: 0 };
  assert.deepEqual(original, []); // opening and cancelling leaves the collection untouched
  assert.deepEqual(upsertOnboardingItem(original, unfinished), [unfinished]);
  assert.match(onboardingSource, /FinancialItemForm[\s\S]*onCancel=\{\(\) => setEditor\(undefined\)\}/);
  assert.match(onboardingSource, /CategoryBudgetForm[\s\S]*onCancel=\{\(\) => setEditor\(undefined\)\}/);
  assert.match(onboardingSource, /SavingsGoalForm[\s\S]*onCancel=\{\(\) => setEditor\(undefined\)\}/);
  assert.match(financialItemSource, />Cancel<\/button>/);
  assert.match(savingsGoalSource, />Cancel<\/button>/);
});

test("accounts and both card types remain valid without last four digits", () => {
  const profile = createFinancialProfile();
  profile.accounts = [{ id: "account", name: "Everyday", type: "current", balance: 100000 }];
  profile.debitCards = [{ id: "debit", name: "Everyday debit", country: "United Arab Emirates", currency: "AED", linkedAccountId: "account" }];
  profile.creditCards = [{ id: "credit", name: "Travel", limit: 1000000, owed: 50000, dueDay: 15 }];
  assert.equal(isFinancialProfile(profile), true);
  assert.match(financialItemSource, /lastFour: lastFour \|\| undefined/);
  assert.doesNotMatch(financialItemSource, /required inputMode="numeric"/);
});

test("one account cannot be linked to two debit cards", () => {
  const profile = createFinancialProfile();
  profile.accounts = [{ id: "account", name: "Everyday", type: "current", balance: 0 }];
  const first: DebitCard = { id: "first", name: "First", country: "United Arab Emirates", currency: "AED", linkedAccountId: "account" };
  profile.debitCards = [first];
  assert.equal(debitAccountAvailable(profile, "account"), false);
  assert.equal(debitAccountAvailable(profile, "account", "first"), true);
  assert.match(financialItemSource, /already has a linked debit card/);
});

test("skipping budget creates no zero budget and selected categories alone are stored", () => {
  const profile = createFinancialProfile();
  assert.equal(profile.monthlyBudget, undefined);
  assert.deepEqual(profile.categoryBudgets, []);
  profile.monthlyBudget = 600000;
  const selected = [{ id: "groceries", name: "Groceries", limit: 175000 }];
  const updated = replaceBudgetSnapshot(profile, "2026-08", selected);
  assert.deepEqual(updated.categoryBudgets.map((category) => category.name), ["Groceries"]);
  assert.equal(categoryBudgetValid({ name: "Groceries", limit: 175000 }), true);
  assert.equal(categoryBudgetValid({ name: "Groceries", limit: 0 }), false);
  assert.equal(categoryBudgetValid({ name: "", limit: 100 }), false);
});

test("allocated and unallocated budget values are calculated from the overall budget", () => {
  const profile = createFinancialProfile();
  profile.monthlyBudget = 600000;
  profile.categoryBudgets = [{ id: "one", name: "Housing", limit: 300000, month: "2026-08" }, { id: "two", name: "Food", limit: 125000, month: "2026-08" }];
  assert.deepEqual(budgetAllocation(profile, "2026-08"), { total: 600000, allocated: 425000, unallocated: 175000, categories: profile.categoryBudgets });
  profile.categoryBudgets.push({ id: "three", name: "Travel", limit: 250000, month: "2026-08" });
  assert.equal(budgetAllocation(profile, "2026-08").unallocated, -75000);
});

test("savings goals use optional month and year normalized to the first day", () => {
  assert.equal(normalizeSavingsTargetMonth("2027-12"), "2027-12-01");
  assert.equal(normalizeSavingsTargetMonth(""), undefined);
  const goal: SavingsGoal = { id: "goal", name: "Trip", target: 100000, saved: 0, contribution: 0, targetDate: "2027-12-01", priority: 1 };
  assert.equal(savingsTargetMonth(goal), "2027-12");
  assert.match(savingsGoalSource, /type="month"/);
  assert.doesNotMatch(savingsGoalSource, /type="date"/);
});

test("removal is intentional and review renders entered values rather than a blank shell", () => {
  const card: CreditCard = { id: "card", name: "Travel", limit: 500000, owed: 25000, dueDay: 5 };
  assert.deepEqual(removeOnboardingItem([card], card.id), []);
  for (const label of ["Money setup", "Planning basics", "Monthly plan", "Savings goals", "Starting account balances", "Current cycle", "Usual monthly income", "Monthly spending budget", "Savings guidance"]) assert.match(onboardingSource, new RegExp(label));
  assert.match(onboardingSource, /formatMoney\(accountBalance/);
  assert.match(onboardingSource, /formatMoney\(totalSaved/);
});

test("usual monthly income is optional private planning data and never ledger activity", () => {
  const profile = createFinancialProfile();
  assert.equal(profile.usualMonthlyIncome, undefined);
  profile.accounts = [{ id: "account", name: "Everyday", type: "current", balance: 250_000 }];
  profile.usualMonthlyIncome = 1_000_000;
  assert.equal(isFinancialProfile(profile), true);
  assert.deepEqual(profile.transactions, []);
  assert.equal(ledgerBalancesAt(profile).accounts.account, 250_000);
  assert.match(onboardingSource, /initialAmount=\{draft\.usualMonthlyIncome \?\? 0\}/);
  assert.match(onboardingSource, /usualMonthlyIncome: usualMonthlyIncome \|\| undefined/);
  assert.match(onboardingSource, /Build it myself[\s\S]*Help me plan/);
  assert.match(onboardingSource, /monthlySavingsGuidance: result\.savingsGuidance/);
});

test("responsive foundations use the requested locked viewport and constrain real mobile children", () => {
  const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /export const viewport:[\s\S]*width: "device-width"[\s\S]*initialScale: 1/);
  assert.match(layout, /maximumScale: 1/);
  assert.match(layout, /userScalable: false/);
  assert.match(css, /Mobile width invariant:[\s\S]*\.app-workspace[\s\S]*min-width:0[\s\S]*\.budget-guide-step \.segmented-control button/);
  assert.match(css, /\.budget-custom-amounts[\s\S]*grid-template-columns:1fr/);
  assert.match(css, /\.auth-page input[^}]*font-size:16px!important/);
  assert.match(css, /\.onboarding-page \.savings-goal-fields[^}]*width:100%/);
  assert.match(css, /\.onboarding-page \.savings-goal-fields,[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
});

test("validation reserves a stable message area and positive amounts fail with specific copy", () => {
  const fieldSource = readFileSync(join(root, "components/form-field.tsx"), "utf8");
  const styles = readFileSync(join(root, "app/globals.css"), "utf8");
  assert.match(fieldSource, /field-message-slot/);
  assert.match(fieldSource, /field-label-text/);
  assert.match(styles, /stable-form-field \.field-message-slot[\s\S]*min-height/);
  assert.match(financialItemSource, /Credit limit must be above zero/);
  assert.match(categoryBudgetSource, /Monthly limit must be above zero/);
  assert.match(savingsGoalSource, /Target amount must be above zero/);
});

test("budget cycles support payday starts while constraining recurring days to 28", () => {
  const reference = new Date(2026, 7, 20);
  const first = budgetCycle(1, reference);
  const payday = budgetCycle(25, reference);
  assert.deepEqual([first.start.getFullYear(), first.start.getMonth(), first.start.getDate(), first.end.getMonth(), first.end.getDate()], [2026, 7, 1, 7, 31]);
  assert.deepEqual([payday.start.getFullYear(), payday.start.getMonth(), payday.start.getDate(), payday.end.getMonth(), payday.end.getDate()], [2026, 6, 25, 7, 24]);
  assert.equal(budgetCycle(31, reference).start.getDate(), 28);
});

test("budget start-day editing preserves natural integers and validates only final values", () => {
  assert.equal(normalizeBudgetStartDayInput(""), "");
  assert.equal(normalizeBudgetStartDayInput("9"), "9");
  assert.equal(normalizeBudgetStartDayInput("09"), "9");
  assert.equal(normalizeBudgetStartDayInput("15"), "15");
  assert.equal(normalizeBudgetStartDayInput("28"), "28");
  assert.equal(normalizeBudgetStartDayInput("2x"), null);
  assert.equal(parseBudgetStartDayInput("9"), 9);
  assert.equal(parseBudgetStartDayInput("15"), 15);
  assert.equal(parseBudgetStartDayInput("28"), 28);
  assert.equal(parseBudgetStartDayInput(""), undefined);
  assert.equal(parseBudgetStartDayInput("0"), undefined);
  assert.equal(parseBudgetStartDayInput("29"), undefined);
  assert.equal(parseBudgetStartDayInput("-1"), undefined);
  assert.match(onboardingSource, /type="text" inputMode="numeric"/);
  assert.doesNotMatch(onboardingSource, /Number\(event\.target\.value\)/);
});
