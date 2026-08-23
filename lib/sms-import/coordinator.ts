import { parseFabSms } from "./fab-parser.ts";
import type { SmsImportBank } from "./types.ts";

export const SMS_BANK_PARSERS = {
  fab: parseFabSms,
} as const satisfies Record<SmsImportBank, (input: string) => ReturnType<typeof parseFabSms>>;

export function parseBankSms(bank: SmsImportBank, input: string) {
  return SMS_BANK_PARSERS[bank](input);
}
