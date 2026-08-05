import { AppNavigation } from "@/components/app-navigation";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="app-shell"><AppNavigation /><main className="app-workspace">{children}</main></div>;
}
