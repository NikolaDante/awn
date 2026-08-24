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
  assert.match(navigation, /aria-controls="app-mobile-navigation-card"/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigation, /lastMenuButton\.current\?\.focus/);
  assert.match(navigation, /addButton\.current\?\.focus/);
  assert.match(css, /body:has\(\.app-dialog-backdrop\) \.app-mobile-action-bar/);
  assert.match(css, /padding-bottom:calc\(118px \+ env\(safe-area-inset-bottom\)\)/);
});

test("phone menu uses a floating card instead of the side drawer presentation", () => {
  assert.match(navigation, /id="app-mobile-navigation-card"/);
  assert.match(navigation, /className="mobile-navigation-card"/);
  assert.match(navigation, /containModalFocus\(event, mobileMenu\.current, document\.activeElement\)/);
  assert.match(css, /\.app-shell \.app-sidebar\.is-open \{[\s\S]*?display:none/);
  assert.match(css, /\.mobile-navigation-card \{[\s\S]*?bottom:calc\(86px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.app-mobile-action-bar \{[\s\S]*?z-index:24/);
});

test("floating phone menu contains the expected routes and active state", () => {
  for (const label of ["Dashboard", "Transactions", "History", "Cards & Accounts", "Plan", "Insights", "Settings"]) {
    assert.match(navigation, new RegExp(`label: "${label}"|label="${label}"`));
  }
  assert.match(navigation, /active=\{pathname === item\.href\}/);
  assert.match(navigation, /active=\{pathname === "\/settings"\}/);
  assert.match(navigation, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(css, /\.app-shell \.mobile-navigation-card \.app-nav-link \{[\s\S]*?grid-template-columns:24px minmax\(0,1fr\)/);
  assert.match(css, /\.app-shell \.mobile-navigation-card \.app-nav-link \{[\s\S]*?height:48px/);
  assert.match(css, /\.app-shell \.mobile-navigation-card \.app-nav-link \{[\s\S]*?border-radius:14px/);
  assert.match(css, /\.mobile-navigation-card \.app-nav-link > span:last-child \{[\s\S]*?display:block/);
  assert.match(css, /\.app-shell \.mobile-navigation-card \.app-nav-link\.is-active \{[\s\S]*?background:linear-gradient\(135deg,var\(--awn-violet\),#7e75ff\)/);
  assert.match(css, /\.app-shell \.mobile-navigation-card \.app-nav-link\.is-active:hover,[\s\S]*?\.app-shell \.mobile-navigation-card \.app-nav-link\.is-active:focus-visible \{[\s\S]*?background:linear-gradient\(135deg,var\(--awn-violet\),#7e75ff\)/);
  assert.match(css, /\.app-shell \.mobile-navigation-card \.app-nav-link\.is-active svg \{[\s\S]*?color:#fff/);
});

test("floating phone menu exposes the shared sign-out action below routes", () => {
  assert.match(navigation, /<SignOutButton variant="mobile" redirectTo="\/auth\/sign-in" onSignedOut=\{\(\) => setOpen\(false\)\}/);
  assert.match(navigation, /className="mobile-navigation-footer"/);
  assert.match(css, /\.mobile-navigation-footer \{[\s\S]*?border-top:1px solid rgba\(255,255,255,\.12\)/);
  assert.match(css, /\.mobile-sign-out-button \{[\s\S]*?grid-template-columns:24px minmax\(0,1fr\)/);
  assert.match(css, /\.mobile-sign-out-button \{[\s\S]*?height:48px/);
  assert.match(css, /\.mobile-sign-out-button:focus-visible \{[\s\S]*?outline:2px solid #d9d6ff/);
});

test("quick Add chooser reuses the existing transaction and SMS workflows", () => {
  assert.match(navigation, /<MobileAddChooser/);
  assert.match(navigation, /<TransactionForm close=/);
  assert.match(navigation, /<BankSmsImportDialog close=/);
  assert.match(navigation, /Add transaction/);
  assert.match(navigation, /Import bank SMS/);
  assert.match(navigation, /data-modal-initial-focus/);
});

test("quick Add option rows keep identical geometry and non-resizing focus", () => {
  const focusBlock = css.match(/\.mobile-add-options > button:focus-visible \{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(css, /\.confirm-dialog > \.mobile-add-options \{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.confirm-dialog > \.mobile-add-options \{[\s\S]*?justify-content:stretch/);
  assert.match(css, /\.confirm-dialog > \.mobile-add-options \{[\s\S]*?width:100%/);
  assert.match(css, /\.confirm-dialog > \.mobile-add-options \{[\s\S]*?max-width:100%/);
  assert.match(css, /\.confirm-dialog > \.mobile-add-options \{[\s\S]*?margin:0 auto!important/);
  assert.match(css, /\.mobile-add-options > button \{[\s\S]*?grid-template-columns:42px minmax\(0,1fr\) 18px/);
  assert.match(css, /\.mobile-add-options > button \{[\s\S]*?height:76px/);
  assert.match(css, /\.mobile-add-options > button \{[\s\S]*?padding:13px 14px/);
  assert.match(css, /\.mobile-add-option-icon \{[\s\S]*?width:42px;[\s\S]*?height:42px/);
  assert.match(focusBlock, /outline:0/);
  assert.match(focusBlock, /box-shadow:/);
  assert.doesNotMatch(focusBlock, /(width|height|min-height|padding|margin):/);
});

test("phone transaction and SMS dialogs use constrained bottom-sheet geometry", () => {
  assert.match(css, /align-items:end/);
  assert.match(css, /max-height:min\(92svh,820px\)/);
  assert.match(css, /\.transaction-form > \.transaction-type \{[\s\S]*?grid-template-columns:repeat\(3,1fr\)/);
  assert.match(css, /\.transaction-form \.transaction-fields,[\s\S]*?grid-template-columns:1fr/);
  assert.match(css, /\.sms-import-textarea \{[\s\S]*?min-height:220px;[\s\S]*?max-height:240px/);
  assert.match(sms, /AWN will review them before importing/);
  assert.match(sms, /Currently supported: FAB/);
  assert.match(sms, /sms-import-footer/);
});

test("Add Transaction mobile sheet shares one content inset", () => {
  assert.match(css, /--transaction-mobile-inset:20px/);
  assert.match(css, /\.transaction-form > \.transaction-form-header \{[\s\S]*?padding:22px var\(--transaction-mobile-inset\) 16px/);
  assert.match(css, /\.transaction-form > \.transaction-type \{[\s\S]*?margin:0 var\(--transaction-mobile-inset\) 16px/);
  assert.match(css, /\.transaction-form > \.transaction-form-body \{[\s\S]*?padding:0 var\(--transaction-mobile-inset\)/);
  assert.match(css, /\.transaction-form > \.confirm-dialog-actions \{[\s\S]*?padding:16px var\(--transaction-mobile-inset\) calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
});

test("Transactions separates phone period KPIs without changing its calculations", () => {
  assert.match(transactions, /className="transactions-overview"/);
  assert.match(transactions, /className="transactions-period-kpis"/);
  assert.match(transactions, /value=\{formatMoney\(actual\.income, profile\.currency\)\}/);
  assert.match(transactions, /value=\{formatMoney\(actual\.expenses, profile\.currency\)\}/);
  assert.match(css, /\.transactions-period-kpis \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
