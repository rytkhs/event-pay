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

// ====================================================================
// 決済集計関連スキーマ（MANAGE-002対応）
// ====================================================================

// 決済方法別集計（内部専用）
const PaymentMethodSummarySchema = z.object({
  method: z.enum(["stripe", "cash"]),
  count: z.number().int().min(0),
  totalAmount: z.number().int().min(0),
});

export type PaymentMethodSummary = z.infer<typeof PaymentMethodSummarySchema>;

// 決済ステータス別集計（内部専用）
const PaymentStatusSummarySchema = z.object({
  status: PaymentStatusSchema,
  count: z.number().int().min(0),
  totalAmount: z.number().int().min(0),
});

export type PaymentStatusSummary = z.infer<typeof PaymentStatusSummarySchema>;

// 決済集計データ全体（内部専用）
const PaymentSummarySchema = z.object({
  // 基本集計
  totalPayments: z.number().int().min(0),
  totalAmount: z.number().int().min(0),

  // 方法別集計
  byMethod: z.array(PaymentMethodSummarySchema),

  // ステータス別集計
  byStatus: z.array(PaymentStatusSummarySchema),

  // 未決済ハイライト（pending, failed, refunded）
  unpaidCount: z.number().int().min(0),
  unpaidAmount: z.number().int().min(0),

  // 決済済み（paid, received）
  paidCount: z.number().int().min(0),
  paidAmount: z.number().int().min(0),
});

export type PaymentSummary = z.infer<typeof PaymentSummarySchema>;

// 決済一覧＋集計レスポンス
export const GetEventPaymentsResponseSchema = z.object({
  payments: z.array(
    z.object({
      id: z.string(),
      method: z.enum(["stripe", "cash"]),
      amount: z.number().int(),
      status: PaymentStatusSchema,
      attendance_id: z.string(),
      paid_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    })
  ),
  summary: PaymentSummarySchema,
});

export type GetEventPaymentsResponse = z.infer<typeof GetEventPaymentsResponseSchema>;
