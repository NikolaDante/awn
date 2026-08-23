import { isFabBankMessage, parseFabSms, splitFabMessages } from "./fab-parser.ts";
import { normalizeSmsIdentity, smsImportFingerprint } from "./fingerprint.ts";
import type { SmsImportBank, SmsImportProposal } from "./types.ts";

type SmsBankParser = {
  aliases: readonly string[];
  detects: (rawMessage: string) => boolean;
  split: (input: string) => string[];
  parse: (input: string) => SmsImportProposal[];
};

export const SMS_BANK_REGISTRY = {
  fab: {
    aliases: ["FAB", "First Abu Dhabi Bank"],
    detects: isFabBankMessage,
    split: splitFabMessages,
    parse: parseFabSms,
  },
} as const satisfies Record<SmsImportBank, SmsBankParser>;

export const SMS_BANK_PARSERS = {
  fab: parseFabSms,
} as const satisfies Record<SmsImportBank, (input: string) => SmsImportProposal[]>;

export function smsBankAliases(bank: SmsImportBank) {
  return SMS_BANK_REGISTRY[bank].aliases;
}

export function matchesSmsBankAlias(bank: SmsImportBank, name: string) {
  const normalized = name.trim().toLowerCase();
  return smsBankAliases(bank).some((alias) => {
    const value = alias.toLowerCase();
    return value === "fab" ? /(^|\b)fab(\b|$)/i.test(normalized) : normalized.includes(value);
  });
}

export function detectBankMessage(rawMessage: string): SmsImportBank | null {
  const detected = (Object.entries(SMS_BANK_REGISTRY) as Array<[SmsImportBank, SmsBankParser]>).find(([, parser]) => parser.detects(rawMessage));
  return detected?.[0] ?? null;
}

export function segmentBankMessages(input: string) {
  const coarseBlocks = input.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  return coarseBlocks.flatMap((coarseBlock) => {
    let blocks = [coarseBlock];
    for (const parser of Object.values(SMS_BANK_REGISTRY) as SmsBankParser[]) blocks = blocks.flatMap((block) => parser.split(block));
    return blocks;
  });
}

function unsupportedBankMessage(rawText: string): SmsImportProposal {
  const normalizedText = normalizeSmsIdentity(rawText);
  const fingerprint = smsImportFingerprint(`unsupported|${normalizedText}`);
  const error = "This bank or message format isn't supported yet.";
  return {
    id: fingerprint,
    bank: null,
    bankMessageType: "unsupported",
    proposedTransactionType: null,
    amount: null,
    currency: null,
    date: null,
    time: null,
    accountLastFour: null,
    cardLastFour: null,
    merchantRaw: null,
    merchant: null,
    direction: null,
    observedBalanceAfter: null,
    suggestedCategory: null,
    matchedAccountId: null,
    matchedCardId: null,
    confidence: "low",
    needsReview: true,
    reviewReason: error,
    normalizedText,
    fingerprint,
    parseErrors: [error],
    title: "Unsupported message",
    rawText,
    status: "unsupported",
  };
}

export function parseBankSms(input: string) {
  const proposals = segmentBankMessages(input).flatMap((rawMessage) => {
    const bank = detectBankMessage(rawMessage);
    if (!bank) {
      const unsupported = unsupportedBankMessage(rawMessage);
      return [unsupported];
    }
    return SMS_BANK_REGISTRY[bank].parse(rawMessage);
  });
  return proposals.map((proposal, index) => ({ ...proposal, id: `${proposal.fingerprint}-${index}` }));
}
