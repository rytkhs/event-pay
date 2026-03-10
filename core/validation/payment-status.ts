/**
 * 決済ステータス Zodスキーマ
 */

import { z } from "zod";

import { PAYMENT_STATUS_VALUES } from "@core/constants/statuses";
import { SIMPLE_PAYMENT_STATUS_VALUES } from "@core/utils/payment-status-mapper";

/**
 * 決済ステータスの完全セット
 * DBの payment_status_enum と同期
 */
export const PaymentStatusSchema = z.enum(PAYMENT_STATUS_VALUES);

/**
 * UI用決済ステータス（簡略化）
 * pending/failed -> unpaid, paid/received -> paid
 */
export const SimplePaymentStatusSchema = z.enum(SIMPLE_PAYMENT_STATUS_VALUES);

/**
 * 現金決済の更新先ステータス（received/waived のみ）
 */
export const CashUpdateStatusSchema = z.enum(["received", "waived"]);
