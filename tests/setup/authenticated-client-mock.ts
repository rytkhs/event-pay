/**
 * 認証済みSupabaseクライアントモック
 *
 * テスト環境で getSecureClientFactoryAuthenticatedClient() が
 * 実際に認証されたクライアントを返すようにするためのモジュール
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../types/database";

// テスト用の認証済みクライアントを保持するグローバル変数
let authenticatedTestClient: ReturnType<typeof createClient<Database>> | null = null;
let currentTestUserId: string | null = null;

/**
 * テストユーザーでログインし、認証済みクライアントを設定する
 *
 * @param email テストユーザーのメールアドレス
 * @param password テストユーザーのパスワード
 * @param userId テストユーザーのID
 */
export async function setupAuthenticatedTestClient(
  email: string,
  password: string,
  userId: string
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase URL or Anon Key is not set in environment variables");
  }

  // 新しいクライアントを作成してログイン
  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // テストユーザーでログイン
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(`Failed to sign in test user: ${error.message}`);
  }

  if (!data.session) {
    throw new Error("Sign in succeeded but session is missing");
  }

  // 認証済みクライアントを保存
  authenticatedTestClient = client;
  currentTestUserId = userId;

  // eslint-disable-next-line no-console
  console.log(`✓ Authenticated test client set up for user: ${email} (ID: ${userId})`);
}

/**
 * テスト用の認証済みクライアントを取得する
 *
 * @returns 認証済みSupabaseクライアント、または未設定の場合はnull
 */
export function getAuthenticatedTestClient(): ReturnType<typeof createClient<Database>> | null {
  return authenticatedTestClient;
}

/**
 * 現在のテストユーザーIDを取得する
 */
export function getCurrentTestUserId(): string | null {
  return currentTestUserId;
}

/**
 * 認証済みテストクライアントをクリアする
 */
export async function clearAuthenticatedTestClient(): Promise<void> {
  if (authenticatedTestClient) {
    try {
      await authenticatedTestClient.auth.signOut();
    } catch (error) {
      // サインアウトエラーは無視
      // eslint-disable-next-line no-console
      console.warn("Failed to sign out test client:", error);
    }
    authenticatedTestClient = null;
    currentTestUserId = null;
  }
}

/**
 * 認証済みテストクライアントが設定されているかどうかを確認する
 */
export function hasAuthenticatedTestClient(): boolean {
  return authenticatedTestClient !== null;
}
