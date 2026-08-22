import { FinancialProvider } from "@/components/financial-provider";
import { requireAuthenticatedUserId } from "@/lib/auth/server-user";

export default async function FinancialLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ownerId = await requireAuthenticatedUserId();
  return <FinancialProvider ownerId={ownerId}>{children}</FinancialProvider>;
}
