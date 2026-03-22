import { z } from "zod";

import { hasValidContactMessageContent, hasValidContactNameContent } from "./contact-message";

export const ContactInputSchema = z.object({
  name: z
    .string()
    .max(100, "氏名は100文字以内で入力してください")
    .refine(hasValidContactNameContent, "氏名を入力してください"),
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(320, "メールアドレスは320文字以内で入力してください"),
  message: z
    .string()
    .max(4000, "お問い合わせ内容は4000文字以内で入力してください")
    .refine(hasValidContactMessageContent, "お問い合わせ内容は10文字以上で入力してください"),
  consent: z.boolean().refine((val) => val === true, {
    message: "プライバシーポリシーに同意してください",
  }),
});

export type ContactInput = z.infer<typeof ContactInputSchema>;
