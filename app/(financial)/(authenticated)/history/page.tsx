import { PageHeader } from "@/components/application-ui";
import { HistoryView } from "@/components/finance-app-views";

export default function HistoryPage() {
  return <div className="app-page history-page"><PageHeader title="History" eyebrow="Previous budget periods" /><HistoryView /></div>;
}
