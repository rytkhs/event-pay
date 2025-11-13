/**
 * StripeConnectService関連の型定義
 */

import type { PostgrestError } from "@supabase/supabase-js";

import type { LogLevel } from "@core/logging/app-logger";

import { Database } from "@/types/database";

// 新しい型定義をエクスポート
export * from "./types/status-classification";
export * from "./types/audit-log";

// Stripe Connectアカウントステータスの型（データベースのenumに合わせる）
export type StripeAccountStatus = Database["public"]["Enums"]["stripe_account_status_enum"];

// Webhook処理や通知経路では一時的に enum 外の状態が入ることがあるための拡張型
export type StripeAccountStatusLike = StripeAccountStatus | "unknown" | "error";

// Stripe Connectアカウント情報の型（データベーススキーマに合わせる）
export interface StripeConnectAccount {
  user_id: string;
  stripe_account_id: string;
  status: StripeAccountStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Express Account作成パラメータ
export interface CreateExpressAccountParams {
  userId: string;
  email: string;
  country?: string;
  businessType?: "individual" | "company";
  businessProfile?: {
    url?: string;
    productDescription?: string;
  };
}

// Express Account作成結果
export interface CreateExpressAccountResult {
  accountId: string;
  status: StripeAccountStatus;
}

// Account Link生成パラメータ
export interface CreateAccountLinkParams {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
  type?: "account_onboarding" | "account_update";
  collectionOptions?: {
    fields?: "currently_due" | "eventually_due";
    futureRequirements?: "include" | "omit";
  };
}

// Account Link生成結果
export interface CreateAccountLinkResult {
  url: string;
  expiresAt: number;
}

// アカウント情報取得結果
export interface AccountInfo {
  accountId: string;
  status: StripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /**
   * Stripe Account オブジェクト
   * StatusSyncServiceがAPI呼び出しを削減するために返す
   */
  stripeAccount: import("stripe").Stripe.Account;
  email?: string;
  country?: string;
  businessType?: string;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    pending_verification: string[];
    disabled_reason?: string;
    current_deadline?: number | null; // Unix timestamp: 要件充足の期限
    errors?: Array<{
      code: string;
      reason: string;
      requirement: string;
    }>;
  };
  capabilities?: {
    card_payments?: "active" | "inactive" | "pending";
    transfers?: "active" | "inactive" | "pending";
  };
  /**
   * 分類メタデータ（監査ログ用）
   */
  classificationMetadata?: {
    gate: 1 | 2 | 3 | 4 | 5;
    details_submitted: boolean;
    payouts_enabled: boolean;
    transfers_active: boolean;
    card_payments_active: boolean;
    has_due_requirements: boolean;
    disabled_reason?: string;
  };
}

// アカウントステータス更新パラメータ
export interface UpdateAccountStatusParams {
  userId: string;
  status: StripeAccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  stripeAccountId?: string;
  /**
   * 分類メタデータ（監査ログ用）
   * AccountStatusClassifierから取得した分類情報
   */
  classificationMetadata?: {
    gate: 1 | 2 | 3 | 4 | 5;
    details_submitted: boolean;
    payouts_enabled: boolean;
    transfers_active: boolean;
    card_payments_active: boolean;
    has_due_requirements: boolean;
    disabled_reason?: string;
  };
  /**
   * ステータス変更のトリガー（監査ログ用）
   */
  trigger?: "webhook" | "ondemand" | "manual";
}

// ビジネスプロファイル更新パラメータ
export interface UpdateBusinessProfileParams {
  accountId: string;
  businessProfile: {
    url?: string;
    product_description?: string;
    mcc?: string;
  };
}

// ビジネスプロファイル更新結果
export interface UpdateBusinessProfileResult {
  success: boolean;
  accountId: string;
  updatedFields: string[];
}

// StripeConnect関連のエラー型
export enum StripeConnectErrorType {
  // ユーザーエラー
  ACCOUNT_ALREADY_EXISTS = "ACCOUNT_ALREADY_EXISTS",
  ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND",
  INVALID_ACCOUNT_STATUS = "INVALID_ACCOUNT_STATUS",
  ONBOARDING_INCOMPLETE = "ONBOARDING_INCOMPLETE",

  // Stripe APIエラー
  STRIPE_API_ERROR = "STRIPE_API_ERROR",
  ACCOUNT_CREATION_FAILED = "ACCOUNT_CREATION_FAILED",
  ACCOUNT_LINK_CREATION_FAILED = "ACCOUNT_LINK_CREATION_FAILED",
  ACCOUNT_RETRIEVAL_FAILED = "ACCOUNT_RETRIEVAL_FAILED",

  // システムエラー
  DATABASE_ERROR = "DATABASE_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

// StripeConnectエラークラス
export class StripeConnectError extends Error {
  public readonly type: StripeConnectErrorType;
  public readonly originalError?: Error | PostgrestError;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    type: StripeConnectErrorType,
    message: string,
    originalError?: Error | PostgrestError,
    metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "StripeConnectError";
    this.type = type;
    this.originalError = originalError;
    this.metadata = metadata;
  }
}

// エラーハンドリング結果
export interface ErrorHandlingResult {
  userMessage: string;
  shouldRetry: boolean;
  logLevel: LogLevel;
  shouldNotifyAdmin: boolean;
}
