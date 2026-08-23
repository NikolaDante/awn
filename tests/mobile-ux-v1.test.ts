import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const navigation = source("components/app-navigation.tsx");
const transactions = source("components/transactions-ui.tsx");
const sms = source("components/bank-sms-import.tsx");
const css = source("app/globals.css");

test("mobile shell exposes one persistent Add and Menu control pair", () => {
  assert.match(navigation, /className="app-mobile-action-bar"/);
  assert.match(navigation, /<span>Add<\/span>/);
  assert.match(navigation, /<span>Menu<\/span>/);
  assert.match(navigation, /aria-controls="app-navigation-drawer"/);
  assert.match(navigation, /lastMenuButton\.current\?\.focus/);
  assert.match(navigation, /addButton\.current\?\.focus/);
  assert.match(css, /body:has\(\.app-dialog-backdrop\) \.app-mobile-action-bar/);
  assert.match(css, /padding-bottom:calc\(118px \+ env\(safe-area-inset-bottom\)\)/);
});

test("quick Add chooser reuses the existing transaction and SMS workflows", () => {
  assert.match(navigation, /<MobileAddChooser/);
  assert.match(navigation, /<TransactionForm close=/);
  assert.match(navigation, /<BankSmsImportDialog close=/);
  assert.match(navigation, /Add transaction/);
  assert.match(navigation, /Import bank SMS/);
  assert.match(navigation, /data-modal-initial-focus/);
});

test("phone transaction and SMS dialogs use constrained bottom-sheet geometry", () => {
  assert.match(css, /align-items:end/);
  assert.match(css, /max-height:min\(92svh,820px\)/);
  assert.match(css, /\.transaction-form > \.transaction-type \{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /\.transaction-form \.transaction-fields,[\s\S]*?grid-template-columns:1fr/);
  assert.match(css, /\.sms-import-textarea \{[\s\S]*?min-height:220px;[\s\S]*?max-height:240px/);
  assert.match(sms, /AWN will review them before importing/);
  assert.match(sms, /Currently supported: FAB/);
  assert.match(sms, /sms-import-footer/);
});

test("Transactions separates phone period KPIs without changing its calculations", () => {
  assert.match(transactions, /className="transactions-overview"/);
  assert.match(transactions, /className="transactions-period-kpis"/);
  assert.match(transactions, /value=\{formatMoney\(actual\.income, profile\.currency\)\}/);
  assert.match(transactions, /value=\{formatMoney\(actual\.expenses, profile\.currency\)\}/);
  assert.match(css, /\.transactions-period-kpis \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
