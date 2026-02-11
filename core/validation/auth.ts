import { z } from "zod";

export const loginInputSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
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
  email: z.string().email("有効なメールアドレスを入力してください").max(254),
  password: z.string().min(8, "パスワードは8文字以上で入力してください").max(128),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
