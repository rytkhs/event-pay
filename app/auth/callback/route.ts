import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { logger } from "@core/logging/app-logger";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";

import { getSecureClientFactory } from "@/core/security/secure-client-factory.impl";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";
  if (!next.startsWith("/")) next = "/";

  const hdrs = headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const origin = `${proto}://${host}`;

  if (code) {
    const supabase = getSecureClientFactory().createAuthenticatedClient();

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      // OAuth認証が成功した場合、新規登録か既存ログインかを判定
      const isNewUser = data.user.created_at === data.user.last_sign_in_at;

      // GA4: OAuth認証イベントを送信（非同期、エラーは無視）
      queueMicrotask(async () => {
        try {
          const { ga4Server } = await import("@core/analytics/ga4-server");

          // _ga CookieからClient IDを取得
          const cookieStore = await cookies();
          const gaCookie = cookieStore.get("_ga")?.value;
          const clientId = extractClientIdFromGaCookie(gaCookie);

          // ユーザーIDを取得（Client IDがない場合のフォールバック）
          const userId = data.user.id;

          const eventName = isNewUser ? "sign_up" : "login";
          await ga4Server.sendEvent(
            {
              name: eventName,
              params: {
                method: "google",
              },
            },
            clientId ?? undefined,
            userId,
            undefined, // sessionId（現時点では未設定）
            undefined // engagementTimeMsec（現時点では未設定）
          );
        } catch (error) {
          logger.debug("[GA4] Failed to send OAuth auth event", {
            tag: "ga4OAuthEventFailed",
            error_message: error instanceof Error ? error.message : String(error),
          });
        }
      });

      const forwardedHost = hdrs.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      if (isLocal) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
