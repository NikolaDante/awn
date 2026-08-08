import { AppNavigation } from "@/components/app-navigation";
import { FinancialProvider } from "@/components/financial-provider";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <FinancialProvider><div className="app-shell"><AppNavigation /><main className="app-workspace">{children}</main></div></FinancialProvider>;
}
