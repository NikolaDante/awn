import { AppShell } from "@/components/app-shell";
import { ComingSoonButton, PageHeader } from "@/components/application-ui";
import { DashboardView } from "@/components/financial-views";

export default function DashboardPage() {
  return <AppShell><div className="app-page">
    <PageHeader title="Dashboard" eyebrow="Your monthly picture"><ComingSoonButton>Add transaction</ComingSoonButton><ComingSoonButton secondary>Import bank SMS</ComingSoonButton></PageHeader>
    <DashboardView />
  </div></AppShell>;
}
