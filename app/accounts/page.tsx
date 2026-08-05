import { AppShell } from "@/components/app-shell";
import { PageHeader, SetupCard } from "@/components/application-ui";

export default function AccountsPage() {
  return <AppShell><div className="app-page"><PageHeader title="Accounts & Cards" eyebrow="Your financial starting points" /><div className="intro-copy"><p>Accounts hold the money you have. Credit cards track what you need to pay back. AWN keeps these roles clear so your plan is easier to understand.</p></div><div className="account-sections"><section><div className="section-label"><span aria-hidden="true">◒</span><div><p className="app-eyebrow">Accounts</p><h2>Where your money lives</h2></div></div><SetupCard title="Add your first account">Start with the account you use most. Your accounts will appear here when setup is available.</SetupCard></section><section><div className="section-label"><span aria-hidden="true">◌</span><div><p className="app-eyebrow">Credit cards</p><h2>What you need to pay back</h2></div></div><SetupCard title="Add a credit card">Add cards separately so upcoming repayments have their own clear place in your plan.</SetupCard></section></div></div></AppShell>;
}
