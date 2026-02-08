/**
 * EventPay セキュリティ設定集約
 * 決済・個人情報を扱うアプリケーションとして最高レベルのセキュリティを確保
 */

import { getEnv } from "@core/utils/cloudflare-env";

// Cookie設定
export const COOKIE_CONFIG = {
  httpOnly: true,
  // 強制セキュア設定: 環境変数で明示的に無効化されない限り、HTTPS環境では常にsecure=true
  secure: (() => {
    const env = getEnv();
    // 環境変数でセキュア設定を強制する場合
    if (env.FORCE_SECURE_COOKIES === "true") {
      return true;
    }
    // 環境変数で明示的に無効化されている場合（開発環境のみ）
    if (env.FORCE_SECURE_COOKIES === "false" && env.NODE_ENV === "development") {
      return false;
    }
    // デフォルト: 本番環境またはHTTPS URLの場合はsecure=true
    return (
      env.NODE_ENV === "production" || env.NEXT_PUBLIC_APP_URL?.startsWith("https://") || false
    );
  })(),
  sameSite: "lax" as const, // 決済アプリケーションでの最適バランス（セキュリティ + UX）
  domain: (() => {
    const env = getEnv();
    return env.NODE_ENV === "production" ? env.COOKIE_DOMAIN : undefined;
  })(),
  path: "/",
  maxAge: 24 * 60 * 60, // 24時間（秒単位）
} as const;

// 動的Cookie設定（リクエスト時にHTTPS判定を考慮）
export const getCookieConfig = (isHttps?: boolean) => ({
  ...COOKIE_CONFIG,
  secure: COOKIE_CONFIG.secure || isHttps || false,
});

// 認証関連設定
export const AUTH_CONFIG = {
  // 保護されたパス
  protectedPaths: ["/dashboard", "/events", "/profile", "/admin"],

  // 認証済みユーザーがアクセス不可なパス
  unauthenticatedOnlyPaths: ["/login", "/register"],

  // セッション設定
  session: {
    maxAge: 24 * 60 * 60, // 24時間（秒単位）
    updateAge: 60 * 60, // 1時間ごとに更新（秒単位）
  },

  // Cookie名設定（Supabaseの実際のCookie名パターンに対応）
  cookieNames: {
    // SupabaseのCookie名は"sb-<project-ref>-auth-token"の形式
    // 動的に検出するためのパターン
    sessionPattern: /^sb-.+-auth-token$/,
    // フォールバック用
    session: "sb-auth-token", // 実際のCookie名は動的に検出
    csrf: "csrf-token",
  },
} as const;

// 型定義
export type CookieConfig = typeof COOKIE_CONFIG;
export type AuthConfig = typeof AUTH_CONFIG;
