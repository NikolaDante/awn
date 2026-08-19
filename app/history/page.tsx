import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/application-ui";
import { HistoryView } from "@/components/finance-app-views";

export default function HistoryPage() {
  return <AppShell><div className="app-page history-page"><PageHeader title="History" eyebrow="Previous months" /><HistoryView /></div></AppShell>;
}
