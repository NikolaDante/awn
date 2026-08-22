import { AuthForm } from "@/components/auth-forms";
import { cookies } from "next/headers";

export default async function ResetPasswordPage() {
  const recoveryAuthorized = (await cookies()).get("awn-recovery")?.value === "verified";
  return <AuthForm mode="reset" recoveryAuthorized={recoveryAuthorized} />;
}
