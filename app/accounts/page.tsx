import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/application-ui";
import { AccountsView } from "@/components/financial-views";

export default function AccountsPage() {
  return <AppShell><div className="app-page"><PageHeader title="Accounts & Cards" eyebrow="Your financial starting points" /><div className="intro-copy"><p>Accounts hold the money you have. Credit cards track what you need to pay back. AWN keeps these roles clear so your plan is easier to understand.</p></div><AccountsView /></div></AppShell>;
}
