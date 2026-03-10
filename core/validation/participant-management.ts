/**
 * 参加者管理機能 バリデーションスキーマ
 * 参加者一覧表示（検索/フィルター/ページング）
 */

import { z } from "zod";

import { PaymentStatusSchema, SimplePaymentStatusSchema } from "./payment-status";

// 参加ステータスフィルター（内部専用）
const AttendanceStatusFilterSchema = z.enum(["attending", "not_attending", "maybe"]).optional();

// 決済方法フィルター（内部専用）
const PaymentMethodFilterSchema = z.enum(["stripe", "cash"]).optional();

// UI用決済ステータスフィルター（内部専用） - SimplePaymentStatus
const SimplePaymentStatusFilterSchema = SimplePaymentStatusSchema.optional();

// 検索クエリ（内部専用）
const SearchQuerySchema = z
  .string()
  .max(255)
  .optional()
  .transform((val) => val?.trim() || undefined);

// 参加者一覧取得パラメータ（全件取得用 - フィルタ・ソート・ページネーションはクライアントサイドで処理）
export const GetParticipantsParamsSchema = z.object({
  eventId: z.string().uuid(),
});

export type GetParticipantsParams = z.infer<typeof GetParticipantsParamsSchema>;

// CSVエクスポートパラメータ
export const ExportParticipantsCsvParamsSchema = z.object({
  eventId: z.string().uuid(),
  filters: z
    .object({
      search: SearchQuerySchema,
      attendanceStatus: AttendanceStatusFilterSchema,
      paymentMethod: PaymentMethodFilterSchema,
      paymentStatus: SimplePaymentStatusFilterSchema, // SimplePaymentStatusを使用
    })
    .optional(),
  columns: z
    .array(
      z.enum([
        "nickname",
        "status",
        "payment_method",
        "payment_status",
        "amount",
        "paid_at",
        "created_at",
        "updated_at",
      ])
    )
    .optional()
    .default([
      "nickname",
      "status",
      "payment_method",
      "payment_status",
      "paid_at",
      "created_at",
      "updated_at",
    ]),
});

export type ExportParticipantsCsvParams = z.infer<typeof ExportParticipantsCsvParamsSchema>;

export const ExportParticipantsCsvResultSchema = z.object({
  csvContent: z.string(),
  filename: z.string(),
  truncated: z.boolean(),
});

export type ExportParticipantsCsvResult = z.infer<typeof ExportParticipantsCsvResultSchema>;

// 参加者詳細表示用型（内部専用 - attendances + payments結合）
const ParticipantViewSchema = z.object({
  // attendance fields
  attendance_id: z.string(),
  nickname: z.string(),
  email: z.string(),
  status: z.enum(["attending", "not_attending", "maybe"]),
  attendance_created_at: z.string(),
  attendance_updated_at: z.string(),

  // payment fields (nullable - 決済情報がない場合もある)
  payment_id: z.string().nullable(),
  payment_method: z.enum(["stripe", "cash"]).nullable(),
  payment_status: PaymentStatusSchema.nullable(),
  amount: z.number().nullable(),
  paid_at: z.string().nullable(),
  payment_version: z.number().nullable(), // 楽観的ロック用
  payment_created_at: z.string().nullable(),
  payment_updated_at: z.string().nullable(),
});

export type ParticipantView = z.infer<typeof ParticipantViewSchema>;

// レスポンス型（全件取得 - ページネーション等はクライアントサイドで処理）
export const GetParticipantsResponseSchema = z.object({
  participants: z.array(ParticipantViewSchema),
});

export type GetParticipantsResponse = z.infer<typeof GetParticipantsResponseSchema>;

export const CollectionProgressSummarySchema = z.object({
  targetAmount: z.number().int().min(0),
  collectedAmount: z.number().int().min(0),
  outstandingAmount: z.number().int().min(0),
  exemptAmount: z.number().int().min(0),
  targetCount: z.number().int().min(0),
  collectedCount: z.number().int().min(0),
  outstandingCount: z.number().int().min(0),
  exemptCount: z.number().int().min(0),
  exceptionCount: z.number().int().min(0),
});

export type CollectionProgressSummary = z.infer<typeof CollectionProgressSummarySchema>;

// ====================================================================
// 管理者による参加者追加関連スキーマ（admin-add-attendance.ts）
// ====================================================================

// 管理者による参加者追加の入力スキーマ
export const AdminAddAttendanceInputSchema = z
  .object({
    eventId: z.string().uuid(),
    nickname: z.string().min(1, "ニックネームは必須です").max(50),
    status: z.enum(["attending", "maybe", "not_attending"]).default("attending"),
    bypassCapacity: z.boolean().optional().default(false),
    paymentMethod: z.enum(["cash"]).optional(),
  })
  .refine(
    (data) => {
      if (data.status === "attending" && data.paymentMethod !== undefined) {
        return data.paymentMethod === "cash";
      }
      return true;
    },
    {
      message: "手動追加では現金決済のみ選択可能です",
      path: ["paymentMethod"],
    }
  );

export type AdminAddAttendanceInput = z.infer<typeof AdminAddAttendanceInputSchema>;

// 管理者による参加者追加の結果型
export interface AdminAddAttendanceResult {
  attendanceId: string;
  guestToken: string;
  guestUrl: string;
  canOnlinePay: boolean;
  reason?: string;
  paymentId?: string;
}
