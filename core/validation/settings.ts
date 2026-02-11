import { z } from "zod";

export const updateProfileInputSchema = z.object({
  name: z
    .string()
    .min(1, "表示名は必須です")
    .max(255, "表示名は255文字以内で入力してください")
    .trim(),
});

export const updateEmailInputSchema = z.object({
  newEmail: z
    .string()
    .min(1, "新しいメールアドレスを入力してください")
    .email("有効なメールアドレスを入力してください"),
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
});

export const updatePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
  newPassword: z
    .string()
    .min(8, "パスワードは8文字以上で入力してください")
    .max(128, "パスワードは128文字以内で入力してください"),
});

export const updatePasswordFormSchema = updatePasswordInputSchema
  .extend({
    confirmPassword: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "確認用パスワードが一致しません",
    path: ["confirmPassword"],
  });

export const accountDeletionRequestSchema = z.object({
  confirmText: z
    .string()
    .min(1)
    .refine((value) => {
      const normalized = value.trim().toLowerCase();
      return normalized === "削除します" || normalized === "delete";
    }, "確認語句が一致しません"),
  agreeIrreversible: z.literal("on"),
  agreeStripeDisable: z.literal("on"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type UpdateEmailInput = z.infer<typeof updateEmailInputSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;
export type UpdatePasswordFormInput = z.infer<typeof updatePasswordFormSchema>;
export type AccountDeletionRequestInput = z.infer<typeof accountDeletionRequestSchema>;
