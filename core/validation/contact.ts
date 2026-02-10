import { z } from "zod";

export const ContactInputSchema = z.object({
  name: z.string().min(1, "氏名を入力してください").max(100, "氏名は100文字以内で入力してください"),
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(320, "メールアドレスは320文字以内で入力してください"),
  message: z
    .string()
    .min(10, "お問い合わせ内容は10文字以上で入力してください")
    .max(4000, "お問い合わせ内容は4000文字以内で入力してください"),
  consent: z.boolean().refine((val) => val === true, {
    message: "プライバシーポリシーに同意してください",
  }),
});

export type ContactInput = z.infer<typeof ContactInputSchema>;
