import { headers } from "next/headers";

import { SupabaseClient } from "@supabase/supabase-js";

import { type ActionResult, fail, ok } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit";
import { AdminReason, createSecureSupabaseClient } from "@core/security";
import { createClient as createServerClient } from "@core/supabase/server";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";

import type { Database } from "@/types/database";

import { seedDemoData } from "../services/seeder";

/**
 * デモセッションを開始する Server Action
 *
 * 成功時は redirectUrl を含む ActionResult を返す。
 * クライアント側でリダイレクトを行う。
 */
export async function startDemoSession(): Promise<ActionResult<{ redirectUrl: string }>> {
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";

  if (!isDemo) {
    return fail("FORBIDDEN", {
      userMessage: "この操作はデモ環境でのみ利用可能です。",
    });
  }

  // Rate Limit: 同一IPからのデモ作成を制限 (1時間に10回まで)
  const ip = getClientIPFromHeaders(headers());
  const rlResult = await enforceRateLimit({
    keys: [buildKey({ scope: "demo.create", ip }) as string],
    policy: POLICIES["demo.create"],
  });

  if (!rlResult.allowed) {
    return fail("RATE_LIMITED", {
      userMessage: `リクエスト回数の上限に達しました。${rlResult.retryAfter}秒後に再試行してください。`,
      retryable: true,
      details: { retryAfter: rlResult.retryAfter },
    });
  }

  // 1. Create User (Admin Client)
  const factory = createSecureSupabaseClient();
  const adminClient = (await factory.createAuditedAdminClient(
    AdminReason.DEMO_SETUP,
    "Demo Session Creation"
  )) as SupabaseClient<Database>;

  const email = `demo-${crypto.randomUUID().split("-")[0]}@example.com`;
  const password = `demo-pass-${crypto.randomUUID()}`;

  const { data: userResult, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      is_ephemeral_demo: true,
      name: "デモユーザー",
    },
  });

  if (createError || !userResult.user) {
    logger.error("Failed to create demo user", {
      category: "system",
      action: "demo_create_user_failed",
      outcome: "failure",
      error: createError,
    });
    return fail("INTERNAL_ERROR", {
      userMessage: "デモユーザーの作成に失敗しました。しばらく経ってから再試行してください。",
      retryable: true,
    });
  }

  const userId = userResult.user.id;

  // 2. Seed Data
  try {
    await seedDemoData(adminClient, userId);
  } catch (e) {
    logger.error("Demo data seeding failed", {
      category: "system",
      action: "demo_seed_data_failed",
      outcome: "failure",
      user_id: userId,
      error: e instanceof Error ? e.message : String(e),
    });
    // ユーザー作成済みだがデータ投入失敗。デモとしては致命的なのでエラーにする
    // 本来はユーザー削除などのクリーンアップが必要だが、Ephemeral環境なので許容
    return fail("INTERNAL_ERROR", {
      userMessage: "デモデータの作成に失敗しました。しばらく経ってから再試行してください。",
      retryable: true,
    });
  }

  // 3. Login (Set Cookies)
  // ここでは通常のServer Client (middleware連携) を使用してログインし、Cookieをセットする
  const supabase = createServerClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError) {
    logger.error("Demo user login failed", {
      category: "system",
      action: "demo_login_failed",
      outcome: "failure",
      user_id: userId,
      error: loginError.message,
    });
    return fail("INTERNAL_ERROR", {
      userMessage: "デモユーザーのログインに失敗しました。しばらく経ってから再試行してください。",
      retryable: true,
    });
  }

  logger.info("Demo session started successfully", {
    category: "system",
    action: "demo_session_started",
    outcome: "success",
    user_id: userId,
  });

  // 4. Return success with redirect URL
  return ok({ redirectUrl: "/dashboard" });
}
