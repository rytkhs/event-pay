/**
 * EventPay セキュリティ設定集約
 * 決済・個人情報を扱うアプリケーションとして最高レベルのセキュリティを確保
 */

import { RateLimitConfig } from "@/lib/rate-limit/types";

// レート制限設定
export const RATE_LIMIT_CONFIG = {
  // ユーザー登録API
  register: {
    windowMs: 15 * 60 * 1000, // 15分
    maxAttempts: 5, // 5回まで
    blockDurationMs: 60 * 60 * 1000, // 1時間ブロック
  } as RateLimitConfig,

  // ログインAPI
  login: {
    windowMs: 15 * 60 * 1000, // 15分
    maxAttempts: 10, // 10回まで
    blockDurationMs: 30 * 60 * 1000, // 30分ブロック
  } as RateLimitConfig,

  // パスワードリセットAPI
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1時間
    maxAttempts: 3, // 3回まで
    blockDurationMs: 24 * 60 * 60 * 1000, // 24時間ブロック
  } as RateLimitConfig,

  // メール再送信API（未確認ユーザーログイン時）
  emailResend: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 2, // 2回まで
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック
  } as RateLimitConfig,

  // 招待リンク関連API（GET リクエストが頻繁に発生するため緩い設定）
  invite: {
    windowMs: 1 * 60 * 1000, // 1分
    maxAttempts: 20, // 20回まで（頻繁な検証を許容）
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック（短めに設定）
  } as RateLimitConfig,

  // 参加登録関連（将来のAPI拡張用）
  participation: {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 10, // 10回まで
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  } as RateLimitConfig,

  // ゲスト管理API
  guest: {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 15, // 15回まで（自己管理のため少し多め）
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  } as RateLimitConfig,

  // 一般API（将来拡張用）
  general: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 60, // 60回まで
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック
  } as RateLimitConfig,
} as const;

// Cookie設定
export const COOKIE_CONFIG = {
  httpOnly: true,
  // 強制セキュア設定: 環境変数で明示的に無効化されない限り、HTTPS環境では常にsecure=true
  secure: (() => {
    // 環境変数でセキュア設定を強制する場合
    if (process.env.FORCE_SECURE_COOKIES === "true") {
      return true;
    }
    // 環境変数で明示的に無効化されている場合（開発環境のみ）
    if (process.env.FORCE_SECURE_COOKIES === "false" && process.env.NODE_ENV === "development") {
      return false;
    }
    // デフォルト: 本番環境またはHTTPS URLの場合はsecure=true
    return (
      process.env.NODE_ENV === "production" ||
      process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ||
      false
    );
  })(),
  sameSite: "lax" as const, // 決済アプリケーションでの最適バランス（セキュリティ + UX）
  domain: process.env.NODE_ENV === "production" ? process.env.COOKIE_DOMAIN : undefined,
  path: "/",
  maxAge: 24 * 60 * 60, // 24時間（秒単位）
} as const;

// 動的Cookie設定（リクエスト時にHTTPS判定を考慮）
export const getCookieConfig = (isHttps?: boolean) => ({
  ...COOKIE_CONFIG,
  secure: COOKIE_CONFIG.secure || isHttps || false,
});

// セキュリティヘッダー設定
export const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
  ].join("; "),
} as const;

// 認証関連設定
export const AUTH_CONFIG = {
  // 保護されたパス
  protectedPaths: ["/home", "/events", "/profile", "/admin"],

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

// パスワード強度設定
export const PASSWORD_CONFIG = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false, // EventPayでは利便性を重視

  // パスワード強度チェック用正規表現
  patterns: {
    uppercase: /[A-Z]/,
    lowercase: /[a-z]/,
    numbers: /[0-9]/,
    specialChars: /[!@#$%^&*(),.?":{}|<>]/,
  },
} as const;

// Supabase設定
export const SUPABASE_CONFIG = {
  // RLS（Row Level Security）強制
  enforceRLS: true,

  // サービスロール使用時の制限
  serviceRoleRestrictions: {
    allowedOperations: ["INSERT", "SELECT", "UPDATE"], // DELETEは禁止
    restrictedTables: ["users.email"], // 直接アクセス禁止
    requiredFunctions: ["get_event_creator_name"], // 必須関数
  },
} as const;

// Server Actions専用設定（自動CSRF保護）
export const SERVER_ACTIONS_CONFIG = {
  // Server Actionsは自動的にCSRF保護される
  autoProtection: true,
  // API Routesは使用しない（全てServer Actionsで実装）
  apiRoutesDisabled: true,
} as const;

// EventPay固有のセキュリティ設定
export const EVENTPAY_SECURITY = {
  // 決済情報保護
  payment: {
    encryptionRequired: true,
    auditLogging: true,
    accessRestriction: "SERVER_ONLY", // サーバーサイドのみ
  },

  // 個人情報保護
  pii: {
    emailAccessMethod: "FUNCTION_ONLY", // 関数経由のみ
    dataRetention: 365, // 日数
    anonymizationRequired: true,
  },

  // イベント関連セキュリティ
  events: {
    creatorVerification: true,
    participantPrivacy: true,
    paymentIsolation: true, // 参加者間での決済情報隔離
  },
} as const;

// 環境別設定
export const ENVIRONMENT_CONFIG = {
  development: {
    rateLimitEnabled: true,
    securityHeadersEnabled: true,
    httpsRequired: false,
  },
  production: {
    rateLimitEnabled: true,
    securityHeadersEnabled: true,
    httpsRequired: true,
  },
} as const;

// 型定義
export type SecurityConfig = typeof RATE_LIMIT_CONFIG;
export type CookieConfig = typeof COOKIE_CONFIG;
export type AuthConfig = typeof AUTH_CONFIG;
export type PasswordConfig = typeof PASSWORD_CONFIG;
export type ServerActionsConfig = typeof SERVER_ACTIONS_CONFIG;
