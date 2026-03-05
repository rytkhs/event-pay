"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createServerActionSupabaseClient } from "@core/supabase/factory";

/**
 * Google OAuth 認証を開始する (redirect-only)
 *
 * @remarks
 * 成功時: Google の OAuth 画面へ redirect
 * 失敗時: /auth/auth-code-error へ redirect
 */
export async function startGoogleOAuth(formData: FormData): Promise<never> {
  const nextParam = (formData.get("next") as string) || "/";

  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const origin = `${proto}://${host}`;

  const supabase = await createServerActionSupabaseClient();

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
