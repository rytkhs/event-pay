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
    const lineSub = profile.sub;

    if (!lineSub) {
      logger.error("Subject (sub) not found in LINE profile", { tag: "lineLoginSubMissing" });
      return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.AUTH_FAILED}`);
    }

    // 4. Supabase Admin操作（Service Role使用）
    // 監査付きAdminクライアントを作成
    const supabaseAdmin = await getSecureClientFactory().createAuditedAdminClient(
      AdminReason.LINE_LOGIN,
      "line-auth-callback",
      {
        additionalInfo: {
          line_user_id: lineSub,
          email: email,
        },
      }
    );

    // 5. ユーザーの検索・作成・更新
    let userId: string;
    let isNewUser = false;

    // A. line_accounts テーブルを検索 (channel_id, line_sub)
    const { data: existingLineAccount, error: lineAccountError } = await supabaseAdmin
      .from("line_accounts")
      .select("auth_user_id")
      .eq("channel_id", channelId)
      .eq("line_sub", lineSub)
      .single();

    if (lineAccountError && lineAccountError.code !== "PGRST116") {
      // PGRST116 = no rows found (想定内のエラー)
      logger.error("Failed to query line_accounts", {
        tag: "lineAccountQueryError",
        error: lineAccountError,
      });
      throw lineAccountError;
    }

    if (existingLineAccount) {
      // A-1. 既に紐付いているユーザーがいる場合
      userId = existingLineAccount.auth_user_id;

      // プロフィール情報の更新（非同期で良いが、ここではawaitしておく）
      const { error: updateError } = await supabaseAdmin
        .from("line_accounts")
        .update({
          email: email,
          display_name: profile.name,
          picture_url: profile.picture,
          updated_at: new Date().toISOString(),
        })
        .eq("channel_id", channelId)
        .eq("line_sub", lineSub);

      if (updateError) {
        logger.error("Failed to update line_accounts", {
          tag: "lineAccountUpdateError",
          error: updateError,
        });
        throw updateError;
      }
    } else {
      // A-2. まだ紐付いていない場合 -> Emailで既存ユーザーを探す
      let existingAuthUser = null;

      if (email) {
        const { data: user, error: userQueryError } = await supabaseAdmin
          .from("users") // public.users ? auth.users ? -> public.users has id, email usually synced
          .select("id")
          .eq("email", email)
          .single();

        if (userQueryError && userQueryError.code !== "PGRST116") {
          // PGRST116 = no rows found (想定内のエラー)
          logger.error("Failed to query users table", {
            tag: "usersQueryError",
            error: userQueryError,
          });
          throw userQueryError;
        }
        existingAuthUser = user;
      }

      if (existingAuthUser) {
        // B-1. Emailが一致する既存ユーザーがいる -> 紐付けを作成
        userId = existingAuthUser.id;

        const { error: insertError } = await supabaseAdmin.from("line_accounts").insert({
          auth_user_id: userId,
          channel_id: channelId,
          line_sub: lineSub,
          email: email,
          display_name: profile.name,
          picture_url: profile.picture,
        });

        if (insertError) {
          logger.error("Failed to insert line_accounts for existing user", {
            tag: "lineAccountInsertError",
            error: insertError,
          });
          throw insertError;
        }
      } else {
        // B-2. Emailも一致しない（完全新規 or Emailなし） -> 新規ユーザー作成
        if (!email) {
          // Emailがない場合はエラーにする
          logger.error("Email not found in LINE profile for new user", {
            tag: "lineLoginEmailMissing",
          });
          return NextResponse.redirect(`${origin}/login?error=${LINE_ERROR_CODES.EMAIL_REQUIRED}`);
        }

        isNewUser = true;
        const userMetadata = {
          full_name: profile.name,
          name: profile.name,
          avatar_url: profile.picture,
          provider: "line",
          line_user_id: lineSub,
        };

        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          email_confirm: true,
          user_metadata: userMetadata,
        });

        if (createError || !newUser.user) {
          throw createError;
        }

        userId = newUser.user.id;

        // line_accounts に紐付け作成
        const { error: insertError } = await supabaseAdmin.from("line_accounts").insert({
          auth_user_id: userId,
          channel_id: channelId,
          line_sub: lineSub,
          email: email,
          display_name: profile.name,
          picture_url: profile.picture,
        });

        if (insertError) {
          logger.error("Failed to insert line_accounts for new user", {
            tag: "lineAccountInsertError",
            error: insertError,
          });
          throw insertError;
        }
      }
    }

    // 6. Magic Linkを使用したセッション確立

    // userId から email を取得する (確実なEmailを使うため)
    const { data: userForLogin, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError || !userForLogin?.user?.email) {
      throw new Error("Failed to get user email for login");
    }
    const loginEmail = userForLogin.user.email;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: loginEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      throw linkError;
    }

    // 7. 通常のSupabaseクライアントでセッションを確立
    const supabase = getSecureClientFactory().createAuthenticatedClient();

    const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
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
