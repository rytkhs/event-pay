/**
 * EventPay セキュリティ設定集約
 * 決済・個人情報を扱うアプリケーションとして最高レベルのセキュリティを確保
 */

import { getEnv } from "@core/utils/cloudflare-env";

// レート制限設定
export const RATE_LIMIT_CONFIG = {
  // ユーザー登録API
  register: {
    windowMs: 15 * 60 * 1000, // 15分
    maxAttempts: 5, // 5回まで
    blockDurationMs: 60 * 60 * 1000, // 1時間ブロック
  },

  // ログインAPI
  login: {
    windowMs: 15 * 60 * 1000, // 15分
    maxAttempts: 15, // 15回まで
    blockDurationMs: 30 * 60 * 1000, // 30分ブロック
  },

  // パスワードリセットAPI
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1時間
    maxAttempts: 5, // 5回まで
    blockDurationMs: 2 * 60 * 60 * 1000, // 2時間ブロック
  },

  // メール再送信API（未確認ユーザーログイン時）
  emailResend: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 6, // 6回まで
    blockDurationMs: 3 * 60 * 1000, // 3分ブロック
  },

  // 招待リンク関連API（参加登録と同一設定）
  invite: {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 10, // 10回まで
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  },

  // 参加登録関連（将来のAPI拡張用）
  participation: {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 10, // 10回まで
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  },

  // ゲスト管理API
  guest: {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 15, // 15回まで（自己管理のため少し多め）
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  },

  // 一般API（将来拡張用）
  general: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 60, // 60回まで
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック
  },

  // 決済: Stripeセッション作成（内部UI）
  paymentCreateSession: {
    windowMs: 10 * 1000, // 10秒
    maxAttempts: 3, // 最大3回
    blockDurationMs: 20 * 1000, // 20秒ブロック
  },

  // 決済: 現金ステータス更新（内部UI）
  paymentStatusUpdate: {
    windowMs: 5 * 1000, // 5秒
    maxAttempts: 10, // 最大10回
    blockDurationMs: 20 * 1000, // 20秒ブロック
  },

  // 送金: 手動送金実行（内部UI）
  manualPayout: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 3, // 最大3回（慎重な操作のため制限）
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック
  },

  // Destination charges: Checkout/PaymentIntents作成（公開エンドポイント）
  stripeCheckout: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 10, // 最大10回
    blockDurationMs: 2 * 60 * 1000, // 2分ブロック
  },

  // Destination charges: PaymentIntents直作成（公開エンドポイント）
  stripePaymentIntent: {
    windowMs: 60 * 1000, // 1分
    maxAttempts: 5, // 最大5回（より慎重）
    blockDurationMs: 5 * 60 * 1000, // 5分ブロック
  },

  // 参加者CSVエクスポート（内部UI）
  participantsCsvExport: {
    windowMs: 5 * 60 * 1000, // 5分
    maxAttempts: 5, // 最大5回
    blockDurationMs: 15 * 60 * 1000, // 15分ブロック
  },
} as const;

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
