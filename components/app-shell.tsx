import { AppNavigation } from "@/components/app-navigation";
import { AuthenticatedFinancialGate } from "@/components/authenticated-financial-gate";
import { FinancialProvider } from "@/components/financial-provider";
import { requireAuthenticatedUserId } from "@/lib/auth/server-user";

export async function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await requireAuthenticatedUserId();
  return <FinancialProvider ownerId={ownerId}><AuthenticatedFinancialGate><div className="app-shell"><AppNavigation /><main className="app-workspace">{children}</main></div></AuthenticatedFinancialGate></FinancialProvider>;
}
