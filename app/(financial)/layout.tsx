import { FinancialProvider } from "@/components/financial-provider";
import { UserPreferencesProvider } from "@/components/user-preferences-provider";
import { requireAuthenticatedUserId } from "@/lib/auth/server-user";

export default async function FinancialLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await requireAuthenticatedUserId();
  return <UserPreferencesProvider userId={ownerId}><FinancialProvider ownerId={ownerId}>{children}</FinancialProvider></UserPreferencesProvider>;
}
