import { UNBUDGETED_CATEGORY } from "../financial-ledger.ts";
import type { Currency } from "../financial-types.ts";
import { normalizeSmsIdentity, smsImportFingerprint } from "./fingerprint.ts";
import type { SmsImportMessageType, SmsImportProposal } from "./types.ts";

const HEADERS = [
  ["salary credit", "salary_credit"],
  ["debit card purchase", "debit_card_purchase"],
  ["outward remittance", "outward_remittance"],
  ["inward remittance", "inward_remittance"],
  ["atm cash withdrawal / debit", "atm_cash_withdrawal"],
] as const satisfies readonly (readonly [string, SmsImportMessageType])[];

const headerType = (line: string) => HEADERS.find(([header]) => line.trim().replace(/\s+/g, " ").toLowerCase() === header)?.[1] ?? null;

export function splitFabMessages(input: string) {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const starts = lines.map((line, index) => headerType(line) ? index : -1).filter((index) => index >= 0);
  if (!starts.length) return input.trim() ? [input.trim()] : [];
  const blocks: string[] = [];
  const prefix = lines.slice(0, starts[0]).join("\n").trim();
  if (prefix) blocks.push(prefix);
  starts.forEach((start, index) => {
    const block = lines.slice(start, starts[index + 1] ?? lines.length).join("\n").trim();
    if (block) blocks.push(block);
  });
  return blocks;
}

function money(value: string | undefined) {
  if (!value || !/^\d[\d,]*(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimals = ""] = value.replaceAll(",", "").split(".");
  const amount = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

function amountLine(line: string | undefined) {
  const match = line?.match(/^([A-Z]{3})\s+(.+)$/i);
  if (!match) return { currency: null, amount: null };
  const currency = match[1].toUpperCase();
  return { currency: ["AED", "USD", "EUR", "GBP", "SAR", "RSD"].includes(currency) ? currency as Currency : null, amount: money(match[2].trim()) };
}

function balanceLine(line: string | undefined) {
  const match = line?.match(/^Balance\s+([A-Z]{3})\s+(.+)$/i);
  return match ? { currency: match[1].toUpperCase(), amount: money(match[2].trim()) } : null;
}

export function normalizeFabDate(value: string | undefined) {
  const match = value?.trim().match(/^(?:Date\s+)?(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s+(\d{2}):(\d{2}))?$/i);
  if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const hour = match[4] === undefined ? null : Number(match[4]); const minute = match[5] === undefined ? null : Number(match[5]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day || hour !== null && (hour > 23 || minute === null || minute > 59)) return null;
  return { date: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`, time: hour === null ? null : `${match[4]}:${match[5]}` };
}

export function cleanFabMerchant(value: string) {
  const compact = value.trim().replace(/\s+/g, " ").replace(/\s+AE$/i, "").trim();
  return compact.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function suggestFabCategory(merchant: string) {
  return /GRANDIOSE|SUPERMARKET/i.test(merchant) ? "Groceries" : UNBUDGETED_CATEGORY;
}

function suffix(line: string | undefined, kind: "Account" | "Card") {
  return line?.match(new RegExp(`^${kind}\\s+X{4}(\\d{4})$`, "i"))?.[1] ?? null;
}

function unsupported(rawText: string, error = "FAB message header is not supported."): SmsImportProposal {
  const normalizedText = normalizeSmsIdentity(rawText);
  return { id: smsImportFingerprint(`unsupported|${normalizedText}`), bank: "fab", bankMessageType: "unsupported", proposedTransactionType: null, amount: null, currency: null, date: null, time: null, accountLastFour: null, cardLastFour: null, merchantRaw: null, merchant: null, direction: null, observedBalanceAfter: null, suggestedCategory: null, matchedAccountId: null, matchedCardId: null, confidence: "low", needsReview: true, reviewReason: error, normalizedText, fingerprint: smsImportFingerprint(`unsupported|${normalizedText}`), parseErrors: [error], title: "Unsupported message", rawText, status: "unsupported" };
}

function proposal(rawText: string): SmsImportProposal {
  const lines = rawText.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const messageType = headerType(lines[0]);
  if (!messageType) return unsupported(rawText);
  let amountIndex = 2; let dateIndex = 3; let balanceIndex = 4;
  let accountLastFour: string | null = null; let cardLastFour: string | null = null; let merchantRaw: string | null = null;
  let proposedTransactionType: SmsImportProposal["proposedTransactionType"] = null; let direction: SmsImportProposal["direction"] = null;
  let suggestedCategory: string | null = null; let confidence: SmsImportProposal["confidence"] = "medium"; let title = lines[0];
  if (messageType === "salary_credit") { accountLastFour = suffix(lines[1], "Account"); proposedTransactionType = "income"; suggestedCategory = "Salary"; confidence = "high"; title = "Salary"; }
  if (messageType === "debit_card_purchase") { cardLastFour = suffix(lines[1], "Card"); amountIndex = 2; merchantRaw = lines[3] ?? null; dateIndex = 4; balanceIndex = 5; proposedTransactionType = "expense"; confidence = "high"; title = merchantRaw ? cleanFabMerchant(merchantRaw) : "Debit card purchase"; suggestedCategory = merchantRaw ? suggestFabCategory(merchantRaw) : UNBUDGETED_CATEGORY; }
  if (messageType === "outward_remittance" || messageType === "inward_remittance") { direction = lines[1]?.toLowerCase() === "debit" ? "debit" : lines[1]?.toLowerCase() === "credit" ? "credit" : null; accountLastFour = suffix(lines[2], "Account"); amountIndex = 3; dateIndex = 4; balanceIndex = 5; title = messageType === "outward_remittance" ? "Outward Remittance" : "Inward Remittance"; }
  if (messageType === "atm_cash_withdrawal") { accountLastFour = suffix(lines[1], "Account"); cardLastFour = suffix(lines[2], "Card"); amountIndex = 3; dateIndex = 4; balanceIndex = 5; proposedTransactionType = "transfer"; confidence = "high"; title = "Cash withdrawal"; }
  const parsedAmount = amountLine(lines[amountIndex]); const parsedDate = normalizeFabDate(lines[dateIndex]); const parsedBalance = balanceLine(lines[balanceIndex]);
  const errors: string[] = [];
  if (parsedAmount.amount === null) errors.push("Amount is missing or malformed.");
  if (!parsedAmount.currency) errors.push("Currency is missing or unsupported.");
  if (!parsedDate) errors.push("Date is missing or malformed.");
  if (messageType !== "debit_card_purchase" && messageType !== "atm_cash_withdrawal" && !accountLastFour) errors.push("Account last four digits are missing.");
  if (messageType === "debit_card_purchase" && !cardLastFour) errors.push("Debit card last four digits are missing.");
  if (messageType === "debit_card_purchase" && !merchantRaw) errors.push("Merchant is missing.");
  if ((messageType === "outward_remittance" || messageType === "inward_remittance") && !direction) errors.push("Remittance direction is missing.");
  const normalizedText = normalizeSmsIdentity(rawText);
  const fingerprint = smsImportFingerprint([messageType, parsedAmount.amount, parsedAmount.currency, parsedDate?.date, parsedDate?.time, accountLastFour, cardLastFour, merchantRaw?.trim().replace(/\s+/g, " ").toLowerCase(), direction, normalizedText].join("|"));
  const ambiguous = messageType === "outward_remittance" || messageType === "inward_remittance";
  const needsReview = ambiguous || errors.length > 0;
  const reviewReason = errors[0] ?? (messageType === "outward_remittance" ? "Choose whether this payment was an expense or transfer." : messageType === "inward_remittance" ? "Choose whether this credit was income or a transfer." : null);
  return { id: fingerprint, bank: "fab", bankMessageType: messageType, proposedTransactionType, amount: parsedAmount.amount, currency: parsedAmount.currency, date: parsedDate?.date ?? null, time: parsedDate?.time ?? null, accountLastFour, cardLastFour, merchantRaw, merchant: merchantRaw ? cleanFabMerchant(merchantRaw) : null, direction, observedBalanceAfter: parsedBalance?.amount ?? null, suggestedCategory, matchedAccountId: null, matchedCardId: null, confidence, needsReview, reviewReason, normalizedText, fingerprint, parseErrors: errors, title, rawText, status: errors.length ? "unsupported" : needsReview ? "needs-review" : "ready" };
}

export function parseFabSms(input: string) {
  return splitFabMessages(input).map((block, index) => {
    const parsed = proposal(block);
    return { ...parsed, id: `${parsed.fingerprint}-${index}` };
  });
}
