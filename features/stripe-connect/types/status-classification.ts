/**
 * Stripe Connectアカウントステータス分類の型定義
 * 2層構造（Database Status / UI Status）の型定義とインターフェース
 */

import type { StripeAccountStatus } from "@core/types/statuses";

/**
 * Database Status (4状態)
 * データベース層で管理される技術的なステータス
 */
export type DatabaseStatus = StripeAccountStatus;

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
  /** オンライン集金に使えるか */
  collectionReady: boolean;
  /** Stripe transfers capabilityのステータス */
  transfersStatus: string | null;
  /** requirements.disabled_reasonの値 */
  requirementsDisabledReason: string | null;
  /** requirements/capability requirements の表示・監査用サマリ */
  requirementsSummary: RequirementsSummary;
  /** 分類理由の説明 */
  reason: string;
  /** 分類に使用されたメタデータ */
  metadata: ClassificationMetadata;
}

export type ReviewState = "none" | "pending_review" | "under_review";

export interface RequirementsStateSummary {
  currently_due: string[];
  past_due: string[];
  eventually_due: string[];
  pending_verification: string[];
  disabled_reason?: string;
  current_deadline?: number | null;
}

export interface RequirementsSummary {
  account: RequirementsStateSummary;
  transfers: RequirementsStateSummary;
  review_state: ReviewState;
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
  /** オンライン集金に使えるか */
  collection_ready: boolean;
  /** transfers capabilityがactiveか */
  transfers_active: boolean;
  /** transfers capabilityのステータス */
  transfers_status?: string;
  /** currently_dueが存在するか */
  has_currently_due_requirements: boolean;
  /** past_dueが存在するか */
  has_past_due_requirements: boolean;
  /** eventually_dueが存在するか */
  has_eventually_due_requirements: boolean;
  /** pending_verificationが存在するか */
  has_pending_verification: boolean;
  /** currently_due / past_due / eventually_due / pending_verification のいずれかが存在するか */
  has_due_requirements: boolean;
  /** review状態 */
  review_state: ReviewState;
  /** disabled_reasonの値 */
  disabled_reason?: string;
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
        pending_verification?: string[];
        disabled_reason?: string;
        current_deadline?: number | null;
      };
    };
