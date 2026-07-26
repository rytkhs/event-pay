import { z } from "zod";

export const emailInputSchema = z.string().email("有効なメールアドレスを入力してください").max(254);
export const emailCheckSchema = z.string().email();

export const loginInputSchema = z.object({
  email: emailInputSchema,
  password: z.string().min(1, "パスワードを入力してください").max(128),
});

export const registerInputSchema = z.object({
  email: emailInputSchema,
  password: z.string().min(8, "パスワードは8文字以上で入力してください").max(128),
});

export const resetPasswordInputSchema = z.object({
  email: emailInputSchema,
});

export const verifyOtpInputSchema = z.object({
  email: emailInputSchema,
  otp: z.string().regex(/^\d{6}$/, "6桁の数字を入力してください"),
  type: z.enum(["email", "recovery", "email_change", "signup"]),
});

export const completePasswordResetInputSchema = z
  .object({
    password: z
      .string()
      .min(8, "パスワードは8文字以上で入力してください")
      .max(128, "パスワードは128文字以内で入力してください"),
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "パスワードが一致しません",
    path: ["passwordConfirm"],
  });

export const otpCodeFormSchema = z.object({
  otp: z.string().min(6, {
    message: "6桁の確認コードを入力してください。",
  }),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpInputSchema>;
export type CompletePasswordResetInput = z.infer<typeof completePasswordResetInputSchema>;
export type OtpCodeFormInput = z.infer<typeof otpCodeFormSchema>;
