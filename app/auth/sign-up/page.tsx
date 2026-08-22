import { AuthForm } from "@/components/auth-forms";
import { AuthenticatedAuthPageRedirect } from "@/components/auth-page-redirect";
import { optionalAuthenticatedUserId } from "@/lib/auth/server-user";

export default async function SignUpPage() {
  const ownerId = await optionalAuthenticatedUserId();
  return ownerId ? <AuthenticatedAuthPageRedirect ownerId={ownerId} /> : <AuthForm mode="sign-up" />;
}
