/**
 * Stripe Connect アカウントステータス変更の監査ログ型定義
 *
 * @module features/stripe-connect/types/audit-log
 */

import { StripeAccountStatus } from "../types";
import { ClassificationMetadata } from "./status-classification";

/**
 * ステータス変更のトリガー種別
 */
export type StatusChangeTrigger = "webhook" | "ondemand" | "manual";

/**
 * ステータス変更ログエントリ
 *
 * system_logsテーブルのmetadataフィールドに格納される構造化データ
 */
export interface StatusChangeLog {
  /**
   * タイムスタンプ（ISO 8601形式）
   */
  timestamp: string;

  /**
   * ユーザーID
   */
  user_id: string;

  /**
   * Stripe Connect アカウントID
   */
  stripe_account_id: string;

  /**
   * 変更前のステータス（初回作成時はnull）
   */
  previous_status: StripeAccountStatus | null;

  /**
   * 変更後のステータス
   */
  new_status: StripeAccountStatus;

  /**
   * ステータス変更のトリガー
   */
  trigger: StatusChangeTrigger;

  /**
   * 分類時のメタデータ
   */
  classification_metadata: ClassificationMetadata;
}
