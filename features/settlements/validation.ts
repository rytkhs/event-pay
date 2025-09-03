/**
 * 精算関連バリデーション（settlements feature validation）
 */

import { z } from "zod";

// 精算レポート生成用バリデーション
export const generateReportSchema = z.object({
  eventId: z.string().uuid("イベントIDは有効なUUIDである必要があります"),
  reportType: z.enum(["detailed", "summary"], {
    errorMap: () => ({
      message: "レポート種別は 'detailed' または 'summary' である必要があります",
    }),
  }),
  includeTransactions: z.boolean().optional().default(true),
});

// 振込申請用バリデーション
export const payoutRequestSchema = z.object({
  eventId: z.string().uuid("イベントIDは有効なUUIDである必要があります"),
  amount: z.number().positive("振込金額は正の数である必要があります"),
  notes: z.string().max(500, "備考は500文字以内である必要があります").optional(),
});

// 型定義は個別に定義
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type PayoutRequestInput = z.infer<typeof payoutRequestSchema>;
