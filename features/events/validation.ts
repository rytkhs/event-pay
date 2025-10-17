/**
 * イベント関連バリデーション（events feature validation）
 */

import { z } from "zod";

// イベント作成・更新用バリデーション
export const eventSchema = z.object({
  title: z
    .string()
    .min(1, "イベントタイトルは必須です")
    .max(200, "イベントタイトルは200文字以内である必要があります"),
  description: z.string().max(2000, "説明は2000文字以内である必要があります").optional(),
  event_date: z.string().datetime("有効な日時を入力してください"),
  location: z.string().max(500, "開催場所は500文字以内である必要があります").optional(),
  max_participants: z
    .number()
    .int("最大参加者数は整数である必要があります")
    .min(1, "最大参加者数は1人以上である必要があります")
    .max(10000, "最大参加者数は10000人以下である必要があります")
    .optional(),
  registration_deadline: z.string().datetime("有効な日時を入力してください").optional(),
  fee_amount: z
    .number()
    .int("参加費は整数である必要があります")
    .refine(
      (val) => val === 0 || (val >= 100 && val <= 1000000),
      "参加費は0円（無料）または100〜1,000,000円である必要があります"
    )
    .optional(),
});

// 参加申し込み用バリデーション
export const participationSchema = z.object({
  name: z
    .string()
    .min(1, "参加者名は必須です")
    .max(100, "参加者名は100文字以内である必要があります"),
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(255, "メールアドレスは255文字以内である必要があります"),
  notes: z.string().max(1000, "備考は1000文字以内である必要があります").optional(),
  payment_method: z.enum(["stripe", "cash"], {
    errorMap: () => ({ message: "決済方法を選択してください" }),
  }),
});

// 招待リンク生成用バリデーション
export const inviteGenerationSchema = z.object({
  eventId: z.string().uuid("イベントIDは有効なUUIDである必要があります"),
  forceRegenerate: z.boolean().optional().default(false),
});

// 参加者検索・フィルタ用バリデーション
export const participantFilterSchema = z.object({
  status: z.enum(["confirmed", "pending", "canceled"]).optional(),
  payment_status: z
    .enum(["pending", "paid", "received", "failed", "refunded", "waived"])
    .optional(),
  search: z.string().max(100, "検索キーワードは100文字以内である必要があります").optional(),
});

// 型定義は types.ts または個別に定義
export type EventInput = z.infer<typeof eventSchema>;
export type ParticipationInput = z.infer<typeof participationSchema>;
export type InviteGenerationInput = z.infer<typeof inviteGenerationSchema>;
export type ParticipantFilterInput = z.infer<typeof participantFilterSchema>;
