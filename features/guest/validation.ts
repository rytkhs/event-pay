/**
 * Guest Feature Validation
 * ゲスト機能関連のバリデーション
 */

import { z } from "zod";

// ゲストトークンバリデーション
// 現在の実装では gst_[32文字] = 36文字
export const guestTokenSchema = z
  .string()
  .min(32, "ゲストトークンが短すぎます")
  .max(64, "ゲストトークンが長すぎます") // 36文字 + 将来のバリエーション用余裕
  .regex(/^[A-Za-z0-9_-]+$/, "ゲストトークンの形式が不正です");

// 参加ステータス更新バリデーション
export const updateAttendanceSchema = z.object({
  guestToken: guestTokenSchema,
  attendanceStatus: z.enum(["attending", "not_attending", "pending"], {
    errorMap: () => ({ message: "参加ステータスを正しく選択してください" }),
  }),
  paymentMethod: z.enum(["stripe", "cash"]).optional(),
});

// ゲスト決済セッション作成バリデーション
export const guestStripeSessionSchema = z.object({
  guestToken: guestTokenSchema,
  successUrl: z.string().url("有効な成功時URLを入力してください"),
  cancelUrl: z.string().url("有効なキャンセル時URLを入力してください"),
});

export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
export type GuestStripeSessionInput = z.infer<typeof guestStripeSessionSchema>;
