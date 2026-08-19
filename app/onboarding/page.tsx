import { FinancialProvider } from "@/components/financial-provider";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { requireAuthenticatedUserId } from "@/lib/auth/server-user";

export default async function OnboardingPage() {
  const ownerId = await requireAuthenticatedUserId();
  return <FinancialProvider ownerId={ownerId}><OnboardingFlow /></FinancialProvider>;
}
