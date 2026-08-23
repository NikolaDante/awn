import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { calculateActualSummary } from "../lib/financial-calculations.ts";
import { ledgerBalancesAt, mutateLedger } from "../lib/financial-ledger.ts";
import { createFinancialProfile, type FinancialProfile } from "../lib/financial-types.ts";
import { cleanFabMerchant, normalizeFabDate, parseFabSms, splitFabMessages, suggestFabCategory } from "../lib/sms-import/fab-parser.ts";
import { normalizeSmsIdentity } from "../lib/sms-import/fingerprint.ts";
import { applySmsImportBatch, prepareSmsReview, smsReviewError, smsReviewToTransaction } from "../lib/sms-import/review.ts";

const salary = `Salary Credit
Account XXXX8001
AED 3500.00
05/08/2026
Balance AED 24479.47`;
const purchase = `Debit Card Purchase
Card XXXX2845
AED 65.00
GRANDIOSE SUPERMARKET DUBAI           AE
05/08/26 08:16
Balance AED 20979.47`;
const outward = `Outward Remittance
Debit
Account XXXX8001
AED 3500.00
Date 05/08/2026
Balance AED 20978.98`;
const inward = `Inward Remittance
Credit
Account XXXX8001
AED 20000.00
Date 02/08/2026
Balance AED 21393.04`;
const atm = `ATM Cash Withdrawal / Debit
Account XXXX8001
Card XXXX2845
AED 152.00
31/07/26 10:08
Balance AED 2338.48`;
const five = [salary, purchase, outward, inward, atm].join("\n\n");

function profile(): FinancialProfile {
  return {
    ...createFinancialProfile(),
    onboarding: { currentStep: 6, completed: true },
    cashBalance: 1_000_000,
    accounts: [{ id: "fab-account", name: "First Abu Dhabi Bank", type: "current", balance: 1_000_000, currency: "AED", lastFour: "8001" }],
    debitCards: [{ id: "fab-debit", name: "FAB Debit", country: "United Arab Emirates", currency: "AED", lastFour: "2845", linkedAccountId: "fab-account" }],
    categoryBudgets: [{ id: "groceries", name: "Groceries", limit: 100_000, month: "2026-08" }],
  };
}

test("the exact five FAB fixtures parse into deterministic normalized proposals", () => {
  const proposals = parseFabSms(five);
  assert.equal(proposals.length, 5);
  assert.deepEqual(proposals.map((item) => item.bankMessageType), ["salary_credit", "debit_card_purchase", "outward_remittance", "inward_remittance", "atm_cash_withdrawal"]);
  assert.deepEqual(proposals[0], { ...proposals[0], proposedTransactionType: "income", amount: 350_000, currency: "AED", date: "2026-08-05", accountLastFour: "8001", observedBalanceAfter: 2_447_947, suggestedCategory: "Salary", confidence: "high" });
  assert.equal(proposals[1].amount, 6_500); assert.equal(proposals[1].date, "2026-08-05"); assert.equal(proposals[1].time, "08:16"); assert.equal(proposals[1].cardLastFour, "2845"); assert.equal(proposals[1].merchant, "Grandiose Supermarket Dubai"); assert.equal(proposals[1].suggestedCategory, "Groceries"); assert.equal(proposals[1].observedBalanceAfter, 2_097_947); assert.equal(proposals[1].confidence, "high");
  assert.equal(proposals[2].amount, 350_000); assert.equal(proposals[2].date, "2026-08-05"); assert.equal(proposals[2].proposedTransactionType, null); assert.equal(proposals[2].status, "needs-review"); assert.equal(proposals[2].confidence, "medium");
  assert.equal(proposals[3].amount, 2_000_000); assert.equal(proposals[3].date, "2026-08-02"); assert.equal(proposals[3].proposedTransactionType, null); assert.equal(proposals[3].status, "needs-review");
  assert.equal(proposals[4].proposedTransactionType, "transfer"); assert.equal(proposals[4].amount, 15_200); assert.equal(proposals[4].accountLastFour, "8001"); assert.equal(proposals[4].cardLastFour, "2845"); assert.equal(proposals[4].date, "2026-07-31"); assert.equal(proposals[4].time, "10:08"); assert.equal(proposals[4].observedBalanceAfter, 233_848);
});

test("FAB segmentation tolerates CRLF, whitespace, blank lines, and preserves unsupported blocks", () => {
  const input = `Unknown Bank Message\r\nvalue\r\n\r\n  Salary Credit  \r\n Account XXXX8001\r\n AED 3500.00\r\n05/08/2026\r\nBalance AED 24479.47\r\n\r\nDebit Card Purchase\r\nCard XXXX2845\r\nAED 65.00\r\nGRANDIOSE  SUPERMARKET DUBAI       AE\r\n05/08/26 08:16\r\nBalance AED 20979.47`;
  assert.equal(splitFabMessages(input).length, 3);
  const proposals = parseFabSms(input);
  assert.equal(proposals[0].status, "unsupported");
  assert.equal(proposals[1].bankMessageType, "salary_credit");
  assert.equal(proposals[2].merchant, "Grandiose Supermarket Dubai");
});

test("dates are strict and two-digit FAB years normalize into the 2000s", () => {
  assert.deepEqual(normalizeFabDate("05/08/2026"), { date: "2026-08-05", time: null });
  assert.deepEqual(normalizeFabDate("31/07/26 10:08"), { date: "2026-07-31", time: "10:08" });
  assert.equal(normalizeFabDate("31/02/26 10:08"), null);
  assert.equal(normalizeFabDate("05/08/26 25:00"), null);
});

test("malformed amounts and dates are unsupported without inventing transactions", () => {
  const malformed = parseFabSms(salary.replace("3500.00", "money").replace("05/08/2026", "yesterday"))[0];
  assert.equal(malformed.status, "unsupported");
  assert.deepEqual(malformed.parseErrors, ["Amount is missing or malformed.", "Date is missing or malformed."]);
});

test("missing observed balance and optional purchase time do not fake values", () => {
  const withoutBalance = parseFabSms(salary.replace("\nBalance AED 24479.47", ""))[0];
  assert.equal(withoutBalance.observedBalanceAfter, null);
  const withoutTime = parseFabSms(purchase.replace("05/08/26 08:16", "05/08/2026"))[0];
  assert.equal(withoutTime.date, "2026-08-05"); assert.equal(withoutTime.time, null);
});

test("merchant cleanup and deterministic category rules remain deliberately small", () => {
  assert.equal(cleanFabMerchant("GRANDIOSE SUPERMARKET DUBAI           AE"), "Grandiose Supermarket Dubai");
  assert.equal(suggestFabCategory("Grandiose Market"), "Groceries");
  assert.equal(suggestFabCategory("Neighbourhood Supermarket"), "Groceries");
  assert.equal(suggestFabCategory("Unknown Merchant"), "Other (Unbudgeted)");
});

test("account and debit matching use type, last four, FAB aliases, and linkage", () => {
  const items = prepareSmsReview(profile(), parseFabSms(five), new Set());
  assert.equal(items[0].proposal.matchedAccountId, "fab-account"); assert.equal(items[0].proposal.status, "ready");
  assert.equal(items[1].proposal.matchedCardId, "fab-debit"); assert.equal(items[1].proposal.status, "ready");
  assert.equal(items[4].proposal.matchedAccountId, "fab-account"); assert.equal(items[4].proposal.status, "ready");
});

test("blank, missing, ambiguous, unlinked, and currency-mismatched instruments require review", () => {
  const base = profile();
  assert.equal(prepareSmsReview({ ...base, accounts: base.accounts.map((item) => ({ ...item, lastFour: undefined })) }, [parseFabSms(salary)[0]], new Set())[0].proposal.status, "needs-review");
  assert.equal(prepareSmsReview({ ...base, accounts: [...base.accounts, { ...base.accounts[0], id: "other-fab" }] }, [parseFabSms(salary)[0]], new Set())[0].proposal.status, "needs-review");
  assert.match(prepareSmsReview({ ...base, debitCards: base.debitCards?.map((item) => ({ ...item, linkedAccountId: undefined })) }, [parseFabSms(purchase)[0]], new Set())[0].proposal.reviewReason ?? "", /Link this debit card/);
  assert.match(prepareSmsReview({ ...base, accounts: base.accounts.map((item) => ({ ...item, currency: "USD" })) }, [parseFabSms(salary)[0]], new Set())[0].proposal.reviewReason ?? "", /does not convert currencies/);
  const transfer = prepareSmsReview(base, [parseFabSms(outward)[0]], new Set())[0];
  Object.assign(transfer, { transactionType: "transfer", destination: "account:usd-account" });
  assert.match(smsReviewError({ ...base, accounts: [...base.accounts, { ...base.accounts[0], id: "usd-account", name: "USD account", currency: "USD" }] }, transfer) ?? "", /does not convert currencies/);
});

test("duplicates are visible within a batch and against durable Household history", () => {
  const duplicateBatch = prepareSmsReview(profile(), parseFabSms(`${purchase}\n\n${purchase}`), new Set());
  assert.equal(duplicateBatch[0].proposal.status, "ready"); assert.equal(duplicateBatch[1].proposal.status, "duplicate"); assert.equal(duplicateBatch[1].included, false);
  const existing = new Set([parseFabSms(salary)[0].fingerprint]);
  assert.equal(prepareSmsReview(profile(), [parseFabSms(salary)[0]], existing)[0].proposal.status, "duplicate");
});

test("whitespace variants collide while legitimate different messages do not", () => {
  const standard = parseFabSms(purchase)[0];
  const spaced = parseFabSms(`  Debit Card Purchase\r\nCard XXXX2845\r\nAED 65.00\r\nGRANDIOSE   SUPERMARKET DUBAI       AE\r\n05/08/26 08:16\r\nBalance AED 20979.47  `)[0];
  const different = parseFabSms(purchase.replace("AED 65.00", "AED 66.00"))[0];
  assert.equal(standard.fingerprint, spaced.fingerprint);
  assert.notEqual(standard.fingerprint, different.fingerprint);
  assert.equal(normalizeSmsIdentity(purchase), normalizeSmsIdentity(` ${purchase.replaceAll(" ", "  ")} `));
});

test("category overrides survive conversion into an ordinary expense transaction", () => {
  const item = prepareSmsReview(profile(), [parseFabSms(purchase)[0]], new Set())[0];
  item.category = "Dining Out";
  const converted = smsReviewToTransaction(profile(), item, "2026-08-23T00:00:00.000Z");
  assert.equal(converted.ok, true);
  if (converted.ok) { assert.equal(converted.transaction.type, "expense"); if (converted.transaction.type === "expense") assert.equal(converted.transaction.category, "Dining Out"); assert.equal(converted.transaction.import?.fingerprint, item.proposal.fingerprint); }
});

test("all five reviewed messages use the central ledger with correct financial effects", () => {
  const base = profile(); const items = prepareSmsReview(base, parseFabSms(five), new Set());
  items[2] = { ...items[2], transactionType: "expense", category: "Other (Unbudgeted)" };
  items[3] = { ...items[3], transactionType: "income", incomeCategory: "Miscellaneous Income" };
  items.forEach((item) => assert.equal(smsReviewError(base, item), null));
  const imported = applySmsImportBatch(base, items);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.profile.transactions.length, 5);
  const balances = ledgerBalancesAt(imported.profile);
  assert.equal(balances.accounts["fab-account"], 2_978_300);
  assert.equal(balances.cash, 1_015_200);
  const august = calculateActualSummary(imported.profile, "2026-08");
  assert.equal(august.income, 2_350_000); assert.equal(august.expenses, 356_500); assert.equal(august.categorySpending.Groceries, 6_500);
  assert.equal(imported.records.length, 5);
  assert.equal(imported.profile.accounts[0].balance, 1_000_000, "observed FAB balance never overwrites the opening balance");
});

test("resolved outward and inward transfers remain neutral", () => {
  const base = { ...profile(), cashBalance: 3_000_000 };
  const outwardItem = prepareSmsReview(base, [parseFabSms(outward)[0]], new Set())[0];
  Object.assign(outwardItem, { transactionType: "transfer", destination: "cash:" });
  const outwardImport = applySmsImportBatch(base, [outwardItem]);
  assert.equal(outwardImport.ok, true);
  if (!outwardImport.ok) return;
  assert.equal(calculateActualSummary(outwardImport.profile, "2026-08").expenses, 0);
  const inwardItem = prepareSmsReview(outwardImport.profile, [parseFabSms(inward)[0]], new Set())[0];
  Object.assign(inwardItem, { transactionType: "transfer", source: "cash:" });
  const inwardImport = applySmsImportBatch(outwardImport.profile, [inwardItem]);
  assert.equal(inwardImport.ok, true);
  if (inwardImport.ok) assert.equal(calculateActualSummary(inwardImport.profile, "2026-08").income, 0);
});

test("imported transactions edit and delete through the ordinary ledger while retaining metadata", () => {
  const base = profile(); const item = prepareSmsReview(base, [parseFabSms(purchase)[0]], new Set())[0]; const imported = applySmsImportBatch(base, [item]);
  assert.equal(imported.ok, true); if (!imported.ok) return;
  const transaction = imported.profile.transactions[0];
  const edited = mutateLedger(imported.profile, { kind: "edit", transaction: { ...transaction, amount: 5_000, note: "Edited import" } });
  assert.equal(edited.ok, true); if (!edited.ok) return;
  assert.equal(edited.profile.transactions[0].import?.fingerprint, item.proposal.fingerprint);
  assert.equal(mutateLedger(edited.profile, { kind: "delete", id: transaction.id }).ok, true);
});

test("the importer uses the shared modal, cloud import RPC, and enabled Transactions entry point", () => {
  const root = process.cwd(); const ui = readFileSync(join(root, "components/bank-sms-import.tsx"), "utf8"); const page = readFileSync(join(root, "app/(financial)/(authenticated)/transactions/page.tsx"), "utf8"); const repository = readFileSync(join(root, "lib/cloud-financial-repository.ts"), "utf8");
  assert.match(ui, /<ModalDialog/); assert.match(ui, /Import bank SMS/); assert.match(ui, /Manual paste only/); assert.match(ui, /More banks coming soon/); assert.match(ui, /Resolve \{unresolved\}/); assert.doesNotMatch(ui, /WebOTP|navigator\.sms|provider_token/);
  assert.match(page, /<ImportBankSmsButton/); assert.doesNotMatch(page, /Import bank SMS<\/button>.*disabled/);
  assert.match(repository, /awn_import_financial_transactions/); assert.match(repository, /financial_import_fingerprints/);
});

test("the migration enforces Household-scoped uniqueness and keeps tombstones outside transaction deletion", () => {
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260823000000_fab_sms_import.sql"), "utf8");
  assert.match(migration, /primary key \(household_id, fingerprint\)/);
  assert.match(migration, /private\.awn_is_household_member\(household_id\)/);
  assert.match(migration, /revoke all on table public\.financial_import_fingerprints/);
  assert.match(migration, /awn_save_financial_state\(p_household_id, p_expected_revision, p_profile_data, null\)/);
  assert.doesNotMatch(migration, /delete from public\.financial_import_fingerprints/);
  assert.match(migration, /message = 'import_duplicate'/);
});
