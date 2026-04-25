import { z } from "zod";

import { hasValidContactMessageContent } from "./contact-message";

export const FeedbackCategorySchema = z.enum([
  "feature_request",
  "bug_report",
  "usability",
  "other",
]);

export type FeedbackCategory = z.infer<typeof FeedbackCategorySchema>;

export const feedbackCategoryLabels: Record<FeedbackCategory, string> = {
  feature_request: "機能要望",
  bug_report: "不具合報告",
  usability: "使いにくい点",
  other: "その他",
};

const OptionalEmailSchema = z
  .string()
  .max(320, "メールアドレスは320文字以内で入力してください")
  .refine(
    (value) => {
      const trimmed = value.trim();
      return trimmed === "" || z.string().email().safeParse(trimmed).success;
    },
    {
      message: "有効なメールアドレスを入力してください",
    }
  );

export const FeedbackInputSchema = z.object({
  category: FeedbackCategorySchema,
  message: z
    .string()
    .max(4000, "内容は4000文字以内で入力してください")
    .refine(hasValidContactMessageContent, "内容は10文字以上で入力してください"),
  pageContext: z.string().max(1000, "画面名・URLは1000文字以内で入力してください"),
  name: z.string().max(100, "お名前は100文字以内で入力してください"),
  email: OptionalEmailSchema,
  consent: z.boolean().refine((val) => val === true, {
    message: "プライバシーポリシーに同意してください",
  }),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;
