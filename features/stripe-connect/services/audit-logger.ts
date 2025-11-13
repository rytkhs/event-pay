/**
 * Stripe Connect アカウントステータス変更の監査ログ記録
 *
 * @module features/stripe-connect/services/audit-logger
 */

import "server-only";

import { logToSystemLogs } from "@core/logging/system-logger";

import { StatusChangeLog } from "../types/audit-log";

/**
 * ステータス変更を監査ログに記録
 *
 * system_logsテーブルにステータス変更履歴を記録します。
 * 要件8.1, 8.2に準拠した監査ログを提供します。
 *
 * @param log - ステータス変更ログエントリ
 *
 * @example
 * ```ts
 * await logStatusChange({
 *   timestamp: new Date().toISOString(),
 *   user_id: "user-123",
 *   stripe_account_id: "acct_123",
 *   previous_status: "onboarding",
 *   new_status: "verified",
 *   trigger: "webhook",
 *   classification_metadata: {
 *     gate: 5,
 *     details_submitted: true,
 *     payouts_enabled: true,
 *     transfers_active: true,
 *     card_payments_active: true,
 *     has_due_requirements: false,
 *   },
 * });
 * ```
 */
export async function logStatusChange(log: StatusChangeLog): Promise<void> {
  const statusChangeMessage = log.previous_status
    ? `Stripe Connect account status changed from ${log.previous_status} to ${log.new_status}`
    : `Stripe Connect account status initialized to ${log.new_status}`;

  await logToSystemLogs(
    {
      log_category: "stripe_connect",
      action: "connect.status_change",
      message: statusChangeMessage,
      actor_type: log.trigger === "webhook" ? "webhook" : "user",
      user_id: log.user_id,
      resource_type: "stripe_connect_account",
      resource_id: log.stripe_account_id,
      outcome: "success",
      metadata: {
        previous_status: log.previous_status,
        new_status: log.new_status,
        trigger: log.trigger,
        classification_metadata: log.classification_metadata,
        timestamp: log.timestamp,
      },
      // 重複防止キー: 同一タイムスタンプ・ユーザー・ステータス変更の重複を防ぐ
      dedupe_key: `status_change:${log.user_id}:${log.previous_status}:${log.new_status}:${log.timestamp}`,
    },
    {
      alsoLogToPino: true,
      throwOnError: false, // ログ記録失敗時もメイン処理を継続
    }
  );
}
