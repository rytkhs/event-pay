import * as crypto from "crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  LINE_API,
  LINE_OAUTH_COOKIES,
  LINE_OAUTH_CONFIG,
  LINE_ERROR_CODES,
} from "@core/auth/line-constants";
import { buildOrigin, createLineOAuthCookieOptions } from "@core/auth/line-utils";
import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = getEnv();
  const channelId = env.NEXT_PUBLIC_LINE_CHANNEL_ID;

  if (!channelId) {
    logger.error("LINE Channel ID is not configured", { tag: "lineLoginConfigError" });
    return NextResponse.redirect(
      new URL(`/login?error=${LINE_ERROR_CODES.CONFIG_ERROR}`, request.url)
    );
  }

  const origin = buildOrigin();
  const redirectUri = `${origin}/auth/callback/line`;

  // CSRF対策用のstate生成
  const state = crypto.randomBytes(32).toString("hex");

  // Cookieにstateを保存
  const cookieStore = cookies();
  const cookieOptions = createLineOAuthCookieOptions();

  cookieStore.set(LINE_OAUTH_COOKIES.STATE, state, cookieOptions);

  // LINEの認可URLを構築
  const params = new URLSearchParams({
    response_type: "code",
    client_id: channelId,
    redirect_uri: redirectUri,
    state: state,
    scope: LINE_OAUTH_CONFIG.SCOPE,
  });

  // nextパラメータの処理
  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next");

  if (next) {
    cookieStore.set(LINE_OAUTH_COOKIES.NEXT, next, cookieOptions);
  }

  return NextResponse.redirect(`${LINE_API.AUTHORIZE}?${params.toString()}`);
}
