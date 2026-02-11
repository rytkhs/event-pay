import { z } from "zod";

export const emailInputSchema = z.string().email("有効なメールアドレスを入力してください").max(254);
export const emailCheckSchema = z.string().email();

export const loginInputSchema = z.object({
  email: emailInputSchema,
  password: z.string().min(1, "パスワードを入力してください").max(128),
});

export const registerInputSchema = z.object({
  name: z
    .string()
    .transform((str) => str.trim())
    .refine((trimmed) => trimmed.length >= 1, {
      message: "表示名を入力してください",
    })
    .refine((trimmed) => trimmed.length <= 100, {
      message: "名前は100文字以内で入力してください",
    })
    .refine(
      (trimmed) => {
        if (trimmed.includes("\0") || trimmed.includes("\x1a")) {
          return false;
        }
        if (/[;&|`$(){}[\]<>\\]/.test(trimmed)) {
          return false;
        }
        if (
          /^\s*(rm|cat|echo|whoami|id|ls|pwd|sudo|su|curl|wget|nc|nmap|chmod|chown|kill|ps|top|netstat|find|grep|awk|sed|tail|head|sort|uniq)\s+/.test(
            trimmed
          )
        ) {
          return false;
        }
        return true;
      },
      {
        message: "名前に無効な文字が含まれています",
      }
    ),
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

export const updatePasswordInputSchema = z
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
export type UpdatePasswordInput = z.infer<typeof updatePasswordInputSchema>;
export type OtpCodeFormInput = z.infer<typeof otpCodeFormSchema>;
