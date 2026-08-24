import { HouseholdInvitationView } from "@/components/household-invitation-view";

export default async function HouseholdInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <HouseholdInvitationView token={token} />;
}
