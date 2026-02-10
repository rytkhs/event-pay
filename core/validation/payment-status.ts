/**
 * 決済ステータス Zodスキーマ
 */

import { z } from "zod";

import { PAYMENT_STATUS_VALUES } from "@core/constants/statuses";

/**
 * 決済ステータスの完全セット
 * DBの payment_status_enum と同期
 */
export const PaymentStatusSchema = z.enum(PAYMENT_STATUS_VALUES);

/**
 * UI用決済ステータス（簡略化）
 * pending/failed -> unpaid, paid/received -> paid
 */
export const SimplePaymentStatusSchema = z.enum([
  "unpaid",
  "paid",
  "refunded",
  "waived",
  "canceled",
]);

/**
 * 現金決済の更新先ステータス（received/waived のみ）
 */
export const CashUpdateStatusSchema = z.enum(["received", "waived"]);
