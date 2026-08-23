import { safeReturnPath } from "./routing.ts";

export type SocialAuthProvider = "google" | "apple";
export type SocialAuthEnvironment = {
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED?: string;
  NEXT_PUBLIC_AUTH_APPLE_ENABLED?: string;
};

export const SOCIAL_AUTH_PROVIDERS = [
  { provider: "google", label: "Google", flag: "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED" },
  { provider: "apple", label: "Apple", flag: "NEXT_PUBLIC_AUTH_APPLE_ENABLED" },
] as const satisfies readonly { provider: SocialAuthProvider; label: string; flag: keyof SocialAuthEnvironment }[];

// Keep public variable names explicit so Next.js can replace them in browser bundles.
const defaultEnvironment: SocialAuthEnvironment = {
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
  NEXT_PUBLIC_AUTH_APPLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED,
};

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function enabledSocialAuthProviders(environment: SocialAuthEnvironment = defaultEnvironment) {
  return SOCIAL_AUTH_PROVIDERS.filter((entry) => enabled(environment[entry.flag]));
}

export function parseSocialAuthProvider(value: string | null | undefined): SocialAuthProvider | null {
  return value === "google" || value === "apple" ? value : null;
}

export function socialAuthProviderLabel(provider: SocialAuthProvider | null) {
  return provider === "google" ? "Google" : provider === "apple" ? "Apple" : "Social";
}

export function socialProviderEnabledInSettings(settings: unknown, provider: SocialAuthProvider) {
  if (!settings || typeof settings !== "object" || !("external" in settings)) return false;
  const external = (settings as { external?: unknown }).external;
  return Boolean(external && typeof external === "object" && (external as Record<string, unknown>)[provider] === true);
}

export function socialAuthCallbackUrl(origin: string, next: string | null | undefined, provider: SocialAuthProvider) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeReturnPath(next));
  callback.searchParams.set("provider", provider);
  return callback.toString();
}

export function oauthCallbackFailureState(error: string | null | undefined) {
  return error === "access_denied" ? "cancelled" : "failed";
}

export function socialAuthQueryMessage(state: string | null | undefined, providerValue: string | null | undefined) {
  const provider = parseSocialAuthProvider(providerValue);
  const label = socialAuthProviderLabel(provider);
  if (state === "cancelled") return `${label} sign-in was cancelled.`;
  if (state === "failed") return `We couldn’t complete ${label} sign-in. Please try again.`;
  return "";
}

export function socialAuthInitiationMessage(provider: SocialAuthProvider, providerMessage = "") {
  const label = socialAuthProviderLabel(provider);
  if (/unsupported provider|provider[^.]*not enabled/i.test(providerMessage)) {
    return `${label} sign-in isn’t available right now. Use email and password or try again later.`;
  }
  return `We couldn’t start ${label} sign-in. Check your connection and try again.`;
}
