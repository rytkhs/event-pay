"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@supabase/supabase-js";

import { buildKey, enforceRateLimit, POLICIES } from "@core/rate-limit";
import { createClient as createServerClient } from "@core/supabase/server";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";

import type { Database } from "@/types/database";

import { seedDemoData } from "../services/seeder";

export async function startDemoSession() {
  const isDemo = process.env.NEXT_PUBLIC_IS_DEMO === "true";

  if (!isDemo) {
    throw new Error("This action is only available in Demo environment.");
  }

  // Rate Limit: 同一IPからのデモ作成を制限 (1時間に10回まで)s
  const ip = getClientIPFromHeaders(headers());
  const rlResult = await enforceRateLimit({
    keys: [buildKey({ scope: "demo.create", ip }) as string],
    policy: POLICIES["demo.create"],
  });

  if (!rlResult.allowed) {
    throw new Error(
      `Rate limit exceeded. Please try again later. (Retry in ${rlResult.retryAfter}s)`
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase configuration", {
      url: !!supabaseUrl,
      key: !!serviceRoleKey,
    });
    throw new Error("Missing Supabase Admin configuration.");
  }

  // 1. Create User (Admin Client)
  const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

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
    // ユーザー作成失敗
    console.error("Failed to create demo user", createError);
    throw new Error("Failed to create demo user: " + createError?.message);
  }

  const userId = userResult.user.id;

  // 2. Seed Data
  try {
    await seedDemoData(adminClient, userId);
  } catch (e) {
    console.error("Seeding failed", e);
    // ユーザー作成済みだがデータ投入失敗。デモとしては致命的なのでエラーにする
    // 本来はユーザー削除などのクリーンアップが必要だが、Ephemeral環境なので許容
    throw new Error("Failed to seed demo data.");
  }

  // 3. Login (Set Cookies)
  // ここでは通常のServer Client (middleware連携) を使用してログインし、Cookieをセットする
  const supabase = createServerClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (loginError) {
    console.error("Login failed", loginError);
    throw new Error("Failed to login demo user.");
  }

  // 4. Redirect
  redirect("/dashboard");
}
