export const AWN_STABLE_PREVIEW_ORIGIN = "https://awn-preview-awn4.vercel.app";

export type HouseholdSummary = {
  id: string;
  name: string;
  role: "owner" | "member";
  memberCount: number;
  isPersonal: boolean;
  onboardingCompleted: boolean;
  isActive: boolean;
};

export type HouseholdMemberSummary = {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "member";
  isCurrentUser: boolean;
};

export type HouseholdInvitationSummary = {
  id: string;
  email: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
};

export type HouseholdInvitationPreview = {
  householdName: string;
  invitedBy: string;
  status: HouseholdInvitationSummary["status"];
  expiresAt: string;
  authenticated: boolean;
  emailMatches: boolean;
};

export type CreatedHouseholdInvitation = HouseholdInvitationSummary & { token: string; link: string };
export type AcceptedHouseholdInvitation = { householdId: string; householdName: string; onboardingCompleted: boolean };

type Row = Record<string, unknown>;
const rows = (value: unknown) => Array.isArray(value) ? value as Row[] : value && typeof value === "object" ? [value as Row] : [];
const role = (value: unknown) => value === "owner" || value === "member" ? value : null;
const invitationStatus = (value: unknown) => ["pending", "accepted", "declined", "revoked", "expired"].includes(String(value)) ? value as HouseholdInvitationSummary["status"] : null;

export function invitationLink(token: string) { return `${AWN_STABLE_PREVIEW_ORIGIN}/invite/${encodeURIComponent(token)}`; }

export function parseHouseholdSummaries(value: unknown): HouseholdSummary[] {
  return rows(value).flatMap((row) => {
    const parsedRole = role(row.member_role);
    if (typeof row.household_id !== "string" || typeof row.household_name !== "string" || !parsedRole || !Number.isSafeInteger(row.member_count)) return [];
    return [{ id: row.household_id, name: row.household_name, role: parsedRole, memberCount: Number(row.member_count), isPersonal: row.is_personal === true, onboardingCompleted: row.onboarding_completed === true, isActive: row.is_active === true }];
  });
}

export function parseHouseholdMembers(value: unknown): HouseholdMemberSummary[] {
  return rows(value).flatMap((row) => {
    const parsedRole = role(row.role);
    if (typeof row.user_id !== "string" || typeof row.display_name !== "string" || typeof row.email !== "string" || !parsedRole) return [];
    return [{ userId: row.user_id, displayName: row.display_name, email: row.email, role: parsedRole, isCurrentUser: row.is_current_user === true }];
  });
}

export function parseHouseholdInvitations(value: unknown): HouseholdInvitationSummary[] {
  return rows(value).flatMap((row) => {
    const status = invitationStatus(row.invitation_status);
    if (typeof row.invitation_id !== "string" || typeof row.invited_email !== "string" || typeof row.expires_at !== "string" || typeof row.created_at !== "string" || !status) return [];
    return [{ id: row.invitation_id, email: row.invited_email, status, expiresAt: row.expires_at, createdAt: row.created_at }];
  });
}

export function parseInvitationPreview(value: unknown): HouseholdInvitationPreview | null {
  const row = rows(value)[0]; const status = invitationStatus(row?.invitation_status);
  if (!row || typeof row.household_name !== "string" || typeof row.invited_by !== "string" || typeof row.expires_at !== "string" || !status) return null;
  return { householdName: row.household_name, invitedBy: row.invited_by, status, expiresAt: row.expires_at, authenticated: row.is_authenticated === true, emailMatches: row.email_matches === true };
}

export function sharedHouseholdError(codeOrMessage: string) {
  const messages: Record<string, string> = {
    invalid_invitation_email: "Enter a valid email address.",
    cannot_invite_self: "You can’t invite your own email address.",
    already_household_member: "That person is already a member of this Household.",
    duplicate_pending_invitation: "A pending invitation already exists for this email address.",
    household_member_limit: "This shared plan already has two members.",
    invitation_email_mismatch: "This invitation was sent to another email address.",
    invitation_expired: "This invitation has expired.",
    invitation_not_pending: "This invitation is no longer available.",
    invitation_not_found: "This invitation link is invalid or no longer available.",
    household_owner_required: "Only the Household owner can do that.",
    owner_transfer_required: "Transfer ownership before leaving this shared Household.",
    household_member_not_found: "That Household member is no longer available.",
  };
  return Object.entries(messages).find(([code]) => codeOrMessage.includes(code))?.[1] ?? "AWN couldn’t complete that Household change. Try again.";
}
