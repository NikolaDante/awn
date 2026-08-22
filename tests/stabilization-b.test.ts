import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { modalFocusTargetIndex } from "../components/use-modal-dialog.ts";
import { authenticatedFinancialRoute, authenticatedHomeRoute } from "../lib/onboarding.ts";
import { createFinancialProfile } from "../lib/financial-types.ts";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");
const financialLayout = source("app/(financial)/layout.tsx");
const authenticatedLayout = source("app/(financial)/(authenticated)/layout.tsx");
const authenticatedPages = ["dashboard", "transactions", "history", "cards-accounts", "plan", "insights"].map((route) => source(`app/(financial)/(authenticated)/${route}/page.tsx`)).join("\n");
const navigation = source("components/app-navigation.tsx");
const cards = source("components/cards-accounts-view.tsx");
const modalHook = source("components/use-modal-dialog.ts");
const modalDialog = source("components/modal-dialog.tsx");
const transactions = source("components/transactions-ui.tsx");
const history = source("components/finance-app-views.tsx");
const onboarding = source("components/onboarding-flow.tsx");

test("authenticated routes share one persistent financial provider and app shell", () => {
  assert.match(financialLayout, /<FinancialProvider ownerId=\{ownerId\}>\{children\}<\/FinancialProvider>/);
  assert.match(authenticatedLayout, /<AppShell>\{children\}<\/AppShell>/);
  assert.doesNotMatch(authenticatedPages, /FinancialProvider|AppShell/);
  assert.doesNotMatch(source("components/app-shell.tsx"), /FinancialProvider|requireAuthenticatedUserId/);
});

test("route guards distinguish incomplete and complete signed-in profiles", () => {
  const profile = createFinancialProfile();
  assert.equal(authenticatedFinancialRoute(profile, "/dashboard"), "/onboarding");
  assert.equal(authenticatedFinancialRoute(profile, "/onboarding"), null);
  assert.equal(authenticatedHomeRoute(profile), "/onboarding");
  profile.onboarding.completed = true;
  assert.equal(authenticatedFinancialRoute(profile, "/onboarding"), "/dashboard");
  assert.equal(authenticatedFinancialRoute(profile, "/onboarding", true), null);
  assert.equal(authenticatedFinancialRoute(profile, "/dashboard"), null);
  assert.equal(authenticatedHomeRoute(profile), "/dashboard");
});

test("signed-in auth entry pages resolve household state before redirecting", () => {
  for (const route of ["sign-in", "sign-up"]) {
    const page = source(`app/auth/${route}/page.tsx`);
    assert.match(page, /optionalAuthenticatedUserId/);
    assert.match(page, /AuthenticatedAuthPageRedirect/);
  }
  const gate = source("components/auth-page-redirect.tsx");
  assert.match(gate, /authenticatedHomeRoute\(profile\)/);
  assert.match(gate, /if \(issue\)/);
});

test("mobile navigation keeps visible and accessible names", () => {
  for (const label of ["Dashboard", "Transactions", "History", "Cards & Accounts", "Plan", "Insights"]) assert.match(navigation, new RegExp(`label: "${label.replace("&", "&")}"`));
  assert.match(navigation, /aria-label=\{label\}/);
  assert.match(navigation, /aria-controls="app-navigation-drawer"/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(source("app/globals.css"), /\.app-sidebar\.is-open \.app-nav-link > span:last-child \{ display:inline; \}/);
});

test("Cards and Accounts expanders are controlled semantic buttons", () => {
  assert.match(cards, /className="accounts-section-toggle" type="button"/);
  assert.match(cards, /aria-expanded=\{open\}/);
  assert.match(cards, /aria-controls=\{contentId\}/);
  assert.match(cards, /hidden=\{!open\}/);
  assert.doesNotMatch(cards, /<details className="accounts-section-row"/);
});

test("modal focus wrapping handles forward, backward, and outside focus", () => {
  assert.equal(modalFocusTargetIndex(2, 3, false), 0);
  assert.equal(modalFocusTargetIndex(0, 3, true), 2);
  assert.equal(modalFocusTargetIndex(-1, 3, false), 0);
  assert.equal(modalFocusTargetIndex(-1, 3, true), 2);
  assert.equal(modalFocusTargetIndex(1, 3, false), null);
  assert.equal(modalFocusTargetIndex(0, 0, false), null);
  assert.match(modalHook, /invokingElement/);
  assert.match(modalHook, /invokingElement\.focus/);
  assert.match(modalHook, /document\.querySelectorAll<HTMLElement>\('\[aria-modal="true"\]'\)/);
});

test("shared confirmations replace native transaction confirmation", () => {
  assert.doesNotMatch(`${transactions}\n${history}`, /window\.confirm|window\.alert/);
  assert.match(transactions, /TransactionDeleteDialog/);
  assert.match(transactions, /<ConfirmationDialog/);
  assert.match(history, /<TransactionDeleteDialog/);
  assert.match(modalDialog, /data-modal-initial-focus/);
});

test("savings and onboarding removals use the shared modal system", () => {
  assert.match(history, /<ModalDialog title=\{`Update \$\{goal\.name\}`\}/);
  assert.match(history, /<ConfirmationDialog eyebrow="Savings goals"/);
  assert.match(onboarding, /<ConfirmationDialog eyebrow="Setup item"/);
  for (const copy of ["saved account details", "saved debit card details", "saved credit card details", "saved goal"]) assert.match(onboarding, new RegExp(copy));
});
