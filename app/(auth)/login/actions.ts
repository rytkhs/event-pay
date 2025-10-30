"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSecureClientFactory } from "@/core/security/secure-client-factory.impl";

export async function startGoogleOAuth(formData: FormData) {
  const nextParam = (formData.get("next") as string) || "/";

  const hdrs = headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const origin = `${proto}://${host}`;

  const supabase = getSecureClientFactory().createAuthenticatedClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextParam)}`,
    },
  });

  if (error || !data?.url) {
    redirect("/auth/auth-code-error");
  }

  redirect(data.url);
}
