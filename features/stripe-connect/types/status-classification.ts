/**
 * Stripe Connectアカウントステータス分類の型定義
 * 2層構造（Database Status / UI Status）の型定義とインターフェース
 */

import type Stripe from "stripe";

/**
 * Database Status (4状態)
 * データベース層で管理される技術的なステータス
 */
export type DatabaseStatus = "unverified" | "onboarding" | "verified" | "restricted";

/**
 * UI Status (5状態)
 * UI層で表示される派生ステータス
 */
export type UIStatus =
  | "no_account"
  | "unverified"
  | "requirements_due"
  | "pending_review"
  | "ready"
  | "restricted";

/**
 * Classification Result
 * AccountStatusClassifierの分類結果
 */
export interface ClassificationResult {
  /** 分類されたDatabase Status */
  status: DatabaseStatus;
  /** 分類理由の説明 */
  reason: string;
  /** 分類に使用されたメタデータ */
  metadata: ClassificationMetadata;
}

/**
 * Classification Metadata
 * ステータス分類に使用された判定情報
 */
export interface ClassificationMetadata {
  /** 通過したゲート番号 (1-5) */
  gate: 1 | 2 | 3 | 4 | 5;
  /** details_submittedの値 */
  details_submitted: boolean;
  /** payouts_enabledの値 */
  payouts_enabled: boolean;
  /** transfers capabilityがactiveか */
  transfers_active: boolean;
  /** card_payments capabilityがactiveか */
  card_payments_active: boolean;
  /** due配列が存在するか */
  has_due_requirements: boolean;
  /** disabled_reasonの値 */
  disabled_reason?: string;
}

/**
 * UI Status Result
 * UIStatusMapperのマッピング結果
 */
export interface UIStatusResult {
  /** UI Status */
  uiStatus: UIStatus;
  /** ユーザーに表示するメッセージ */
  message: string;
  /** アクションが必要か */
  actionRequired: boolean;
  /** CTAボタンのテキスト */
  ctaText?: string;
  /** CTAボタンのURL */
  ctaUrl?: string;
}

/**
 * Account Status Data
 * UIコンポーネントに渡すアカウントステータスデータ
 */
export interface AccountStatusData {
  /** アカウントが存在するか */
  hasAccount: boolean;
  /** Stripe Account ID */
  accountId?: string;
  /** Database Status */
  dbStatus?: DatabaseStatus;
  /** UI Status */
  uiStatus: UIStatus;
  /** charges_enabledの値 */
  chargesEnabled: boolean;
  /** payouts_enabledの値 */
  payoutsEnabled: boolean;
  /** 要件情報 */
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
    pending_verification: string[];
    disabled_reason?: string;
    current_deadline?: number | null;
  };
  /** Capability情報 */
  capabilities?: {
    card_payments?: "active" | "inactive" | "pending";
    transfers?: "active" | "inactive" | "pending";
  };
  /** Express Dashboardへのアクセスが可能か */
  expressDashboardAvailable?: boolean;
}

/**
 * Stripe Account Object型
 * Stripe APIから取得されるアカウント情報
 */
export type StripeAccountObject = Stripe.Account;

/**
 * Capability Status型
 * Stripe APIのcapabilityステータス
 */
export type CapabilityStatus = "active" | "inactive" | "pending";

/**
 * Capability型
 * string型またはobject型のcapability
 */
export type Capability =
  | string
  | {
      status: string;
      requirements?: {
        currently_due?: string[];
        past_due?: string[];
        eventually_due?: string[];
        disabled_reason?: string;
      };
    };
