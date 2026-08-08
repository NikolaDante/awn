import { FinancialProvider } from "@/components/financial-provider";
import { OnboardingFlow } from "@/components/onboarding-flow";

export default function OnboardingPage() {
  return <FinancialProvider><OnboardingFlow /></FinancialProvider>;
}
