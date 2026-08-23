import { PageHeader } from "@/components/application-ui";
import { AddTransactionButton, TransactionsView } from "@/components/transactions-ui";
import { ImportBankSmsButton } from "@/components/bank-sms-import";

export default function TransactionsPage() {
  return <div className="app-page transactions-page"><PageHeader title="Transactions" eyebrow="Current budget period"><ImportBankSmsButton /><AddTransactionButton /></PageHeader><TransactionsView /></div>;
}
