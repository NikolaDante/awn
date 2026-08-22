import { AppNavigation } from "@/components/app-navigation";
import { AuthenticatedFinancialGate } from "@/components/authenticated-financial-gate";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthenticatedFinancialGate><div className="app-shell"><AppNavigation /><main className="app-workspace">{children}</main></div></AuthenticatedFinancialGate>;
}
