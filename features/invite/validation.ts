/**
 * Invite Feature Validation
 * 招待機能関連のバリデーション
 */

import { z } from "zod";

// 招待トークンバリデーション
export const inviteTokenSchema = z.string()
  .min(1, "招待トークンは必須です")
  .regex(/^[A-Za-z0-9_-]+$/, "招待トークンの形式が不正です");

// ニックネームバリデーション
export const nicknameSchema = z.string()
  .min(1, "ニックネームは必須です")
  .max(50, "ニックネームは50文字以内で入力してください")
  .regex(/^[^\s].*[^\s]$|^[^\s]$/, "ニックネームの前後にスペースは使用できません");

// メールアドレスバリデーション
export const emailSchema = z.string()
  .min(1, "メールアドレスは必須です")
  .email("有効なメールアドレスを入力してください")
  .max(254, "メールアドレスが長すぎます");

// 決済方法バリデーション
export const paymentMethodSchema = z.enum(["stripe", "cash"], {
  errorMap: () => ({ message: "決済方法を正しく選択してください" })
});

// 参加フォームバリデーション（core/validation/participation.tsと同等）
export const participationFormSchema = z.object({
  nickname: nicknameSchema,
  email: emailSchema,
  paymentMethod: paymentMethodSchema,
});

// 招待トークン生成バリデーション
export const generateInviteTokenSchema = z.object({
  eventId: z.string().uuid("有効なイベントIDを入力してください"),
  forceRegenerate: z.boolean().optional(),
});

// 招待トークン検証バリデーション
export const validateInviteTokenSchema = z.object({
  token: inviteTokenSchema,
});

// 型推論
export type ParticipationFormInput = z.infer<typeof participationFormSchema>;
export type GenerateInviteTokenInput = z.infer<typeof generateInviteTokenSchema>;
export type ValidateInviteTokenInput = z.infer<typeof validateInviteTokenSchema>;
