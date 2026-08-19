import { AppShell } from "@/components/app-shell";
import { AccountsCardsView } from "@/components/cards-accounts-view";

type CardsSearchParams = Promise<{ action?: string | string[] }>;

export default async function CardsAccountsPage({ searchParams }: { searchParams: CardsSearchParams }) {
  const { action } = await searchParams;
  return <AppShell><div className="app-page cards-accounts-page"><AccountsCardsView initialAction={action === "add" ? "add" : undefined} /></div></AppShell>;
}
