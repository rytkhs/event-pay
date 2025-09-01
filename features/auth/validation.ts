/**
 * 認証関連バリデーション（auth feature validation）
 */

import { z } from "zod";

// メールアドレスの基本スキーマ
const emailSchema = z.string()
  .email("有効なメールアドレスを入力してください")
  .max(255, "メールアドレスは255文字以内である必要があります");

// パスワードの基本スキーマ
const passwordSchema = z.string()
  .min(8, "パスワードは8文字以上である必要があります")
  .max(128, "パスワードは128文字以内である必要があります")
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "パスワードには英小文字、英大文字、数字を含める必要があります");

// ユーザー名の基本スキーマ
const nameSchema = z.string()
  .min(1, "名前は必須です")
  .max(100, "名前は100文字以内である必要があります")
  .regex(/^[^\s].*[^\s]$|^[^\s]$/, "名前の前後に空白を含めることはできません");

// ログインバリデーション
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "パスワードは必須です"),
  remember: z.boolean().optional(),
});

// 登録バリデーション
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  name: nameSchema,
  acceptTerms: z.boolean().refine(val => val === true, {
    message: "利用規約に同意する必要があります"
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: "パスワードが一致しません",
  path: ["confirmPassword"],
});

// パスワードリセット要求バリデーション
export const passwordResetSchema = z.object({
  email: emailSchema,
});

// パスワード更新バリデーション
export const passwordUpdateSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "パスワードが一致しません",
  path: ["confirmPassword"],
});

// プロファイル更新バリデーション
export const profileUpdateSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
});

// 型定義は types.ts を参照
