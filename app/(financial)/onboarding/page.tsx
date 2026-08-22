import { OnboardingAccessGate } from "@/components/onboarding-access-gate";
import { OnboardingFlow } from "@/components/onboarding-flow";

type OnboardingSearchParams = Promise<{ step?: string | string[] }>;

export default async function OnboardingPage({ searchParams }: { searchParams: OnboardingSearchParams }) {
  const { step } = await searchParams;
  return <OnboardingAccessGate editMode={typeof step === "string"}><OnboardingFlow /></OnboardingAccessGate>;
}
