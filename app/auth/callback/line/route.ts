import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { LINE_API, LINE_OAUTH_COOKIES, LINE_ERROR_CODES } from "@core/auth/line-constants";
import { buildOrigin } from "@core/auth/line-utils";
import { logger } from "@core/logging/app-logger";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getEnv } from "@core/utils/cloudflare-env";
import { extractClientIdFromGaCookie } from "@core/utils/ga-cookie";

import { LineTokenResponse, LineVerifyResponse } from "@/types/line";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = getEnv();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const origin = buildOrigin();

  // 1. エラーハンドリングとCSRF検証
  if (error) {
    logger.error(`LINE Login Error: ${error}`, { tag: "lineLoginError", error });
    return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.AUTH_FAILED}`);
  }

  const cookieStore = cookies();
  const storedState = cookieStore.get(LINE_OAUTH_COOKIES.STATE)?.value;
  const nextPath = cookieStore.get(LINE_OAUTH_COOKIES.NEXT)?.value ?? "/dashboard";
  const codeVerifier = cookieStore.get(LINE_OAUTH_COOKIES.CODE_VERIFIER)?.value;

  // 検証後はCookieを即削除（ワンタイム利用）
  cookieStore.delete(LINE_OAUTH_COOKIES.STATE);
  cookieStore.delete(LINE_OAUTH_COOKIES.NEXT);
  cookieStore.delete(LINE_OAUTH_COOKIES.CODE_VERIFIER);

  if (!code || !state || !storedState || state !== storedState) {
    logger.error("CSRF validation failed", {
      tag: "lineLoginCsrfFailed",
      state,
      storedState,
    });
    return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.STATE_MISMATCH}`);
  }

  try {
    // URL構造: /auth/callback/line
    const redirectUri = `${origin}/auth/callback/line`;

    const channelId = env.NEXT_PUBLIC_LINE_CHANNEL_ID;
    const channelSecret = env.LINE_CHANNEL_SECRET;

    if (!channelId || !channelSecret) {
      throw new Error("LINE Channel ID or Secret is not configured");
    }

    // 2. LINEアクセストークン取得
    const tokenResponse = await fetch(LINE_API.TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
        ...(codeVerifier && { code_verifier: codeVerifier }),
      }),
    });

    const lineData = (await tokenResponse.json()) as LineTokenResponse;

    if (!tokenResponse.ok || !lineData.id_token) {
      logger.error("Failed to retrieve ID token from LINE", {
        tag: "lineLoginTokenFailed",
        lineData,
      });
      return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.TOKEN_FAILED}`);
    }

    // 3. プロフィール情報の取得と検証
    const verifyResponse = await fetch(LINE_API.VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: lineData.id_token,
        client_id: channelId,
      }),
    });

    const profile = (await verifyResponse.json()) as LineVerifyResponse;
    const email = profile.email;

    if (!email) {
      logger.error("Email not found in LINE profile", { tag: "lineLoginEmailMissing" });
      return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.EMAIL_REQUIRED}`);
    }

    // 4. Supabase Admin操作（Service Role使用）
    // 監査付きAdminクライアントを作成
    const supabaseAdmin = await getSecureClientFactory().createAuditedAdminClient(
      AdminReason.LINE_LOGIN,
      "line-auth-callback",
      {
        additionalInfo: {
          line_user_id: profile.sub,
          email: email,
        },
      }
    );

    // 5. ユーザーの検索・作成・更新
    // public.usersからメールアドレスで検索
    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("email", email)
      .single();

    const userMetadata = {
      full_name: profile.name,
      name: profile.name, // トリガーで使用
      avatar_url: profile.picture,
      provider: "line",
      line_user_id: profile.sub,
    };

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      // 既存ユーザー: auth.usersのメタデータのみ更新
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { user_metadata: userMetadata }
      );

      if (updateError) {
        throw updateError;
      }

      userId = existingUser.id;
    } else {
      // 新規ユーザー: auth.usersを作成（トリガーがpublic.usersも自動作成）
      isNewUser = true;
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        email_confirm: true, // LINE認証済みのため確認済みにする
        user_metadata: userMetadata,
      });

      if (createError || !newUser.user) {
        throw createError;
      }

      userId = newUser.user.id;
    }

    // 6. Magic Linkを使用したセッション確立
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      throw linkError;
    }

    // 7. 通常のSupabaseクライアントでセッションを確立
    const supabase = getSecureClientFactory().createAuthenticatedClient();

    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
      email: email,
    });

    if (sessionError || !sessionData.session) {
      throw sessionError;
    }

    // 8. GA4送信
    queueMicrotask(async () => {
      try {
        const { ga4Server } = await import("@core/analytics/ga4-server");

        // _ga CookieからClient IDを取得
        const cookieStore = cookies();
        const gaCookie = cookieStore.get("_ga")?.value;
        const clientId = extractClientIdFromGaCookie(gaCookie);

        const eventName = isNewUser ? "sign_up" : "login";
        await ga4Server.sendEvent(
          {
            name: eventName,
            params: {
              method: "line",
            },
          },
          clientId ?? undefined,
          userId,
          undefined,
          undefined
        );
      } catch (error) {
        logger.debug("[GA4] Failed to send LINE auth event", {
          tag: "ga4LineEventFailed",
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // 9. 完了後のリダイレクト
    return NextResponse.redirect(`${origin}${nextPath}`);
  } catch (error) {
    logger.error("Unexpected error during LINE login callback", {
      tag: "lineLoginCallbackError",
      error,
    });
    return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.SERVER_ERROR}`);
  }
}
