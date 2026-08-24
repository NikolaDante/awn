import { createClient } from "@/lib/supabase/client";
import {
  invitationLink, parseHouseholdInvitations, parseHouseholdMembers, parseHouseholdSummaries, parseInvitationPreview,
  type AcceptedHouseholdInvitation, type CreatedHouseholdInvitation,
} from "@/lib/shared-households";

function firstRow(value: unknown) { return (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null; }
async function rpc(name: string, parameters: Record<string, unknown> = {}) {
  const { data, error } = await createClient().rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data;
}

export async function listHouseholds() { return parseHouseholdSummaries(await rpc("awn_list_households")); }
export async function listHouseholdMembers(householdId: string) { return parseHouseholdMembers(await rpc("awn_list_household_members", { p_household_id: householdId })); }
export async function listHouseholdInvitations(householdId: string) { return parseHouseholdInvitations(await rpc("awn_list_household_invitations", { p_household_id: householdId })); }

export async function createHouseholdInvitation(householdId: string, email: string): Promise<CreatedHouseholdInvitation> {
  const row = firstRow(await rpc("awn_create_household_invitation", { p_household_id: householdId, p_invited_email: email }));
  if (!row || typeof row.invitation_id !== "string" || typeof row.invited_email !== "string" || typeof row.expires_at !== "string" || typeof row.invitation_token !== "string") throw new Error("invalid_invitation_response");
  return { id: row.invitation_id, email: row.invited_email, status: "pending", expiresAt: row.expires_at, createdAt: new Date().toISOString(), token: row.invitation_token, link: invitationLink(row.invitation_token) };
}

export async function refreshHouseholdInvitation(invitationId: string) {
  const row = firstRow(await rpc("awn_refresh_household_invitation", { p_invitation_id: invitationId }));
  if (!row || typeof row.invitation_token !== "string") throw new Error("invalid_invitation_response");
  return invitationLink(row.invitation_token);
}

export async function getHouseholdInvitationPreview(token: string) { return parseInvitationPreview(await rpc("awn_get_household_invitation_preview", { p_invitation_token: token })); }
export async function revokeHouseholdInvitation(invitationId: string) { await rpc("awn_revoke_household_invitation", { p_invitation_id: invitationId }); }
export async function declineHouseholdInvitation(token: string) { await rpc("awn_decline_household_invitation", { p_invitation_token: token }); }
export async function removeHouseholdMember(householdId: string, userId: string) { await rpc("awn_remove_household_member", { p_household_id: householdId, p_member_user_id: userId }); }
export async function transferHouseholdOwnership(householdId: string, userId: string) { await rpc("awn_transfer_household_ownership", { p_household_id: householdId, p_member_user_id: userId }); }

export async function leaveHousehold(householdId: string) {
  const row = firstRow(await rpc("awn_leave_household", { p_household_id: householdId }));
  if (!row || typeof row.active_household_id !== "string") throw new Error("invalid_household_response");
  return { householdId: row.active_household_id, onboardingCompleted: row.onboarding_completed === true };
}

export async function acceptHouseholdInvitation(token: string): Promise<AcceptedHouseholdInvitation> {
  const row = firstRow(await rpc("awn_accept_household_invitation", { p_invitation_token: token }));
  if (!row || typeof row.household_id !== "string" || typeof row.household_name !== "string") throw new Error("invalid_invitation_response");
  return { householdId: row.household_id, householdName: row.household_name, onboardingCompleted: row.onboarding_completed === true };
}
