/**
 * 参加者管理機能 バリデーションスキーマ
 * MANAGE-001: 参加者一覧表示（検索/フィルター/ページング）
 */

import { z } from "zod";

// 参加ステータスフィルター
export const AttendanceStatusFilterSchema = z
  .enum(["attending", "not_attending", "maybe"])
  .optional();

// 決済方法フィルター
export const PaymentMethodFilterSchema = z
  .enum(["stripe", "cash"])
  .optional();

// 決済ステータスフィルター
export const PaymentStatusFilterSchema = z
  .enum(["pending", "paid", "failed", "received", "refunded", "waived", "completed"])
  .optional();

// ソートフィールド
export const ParticipantSortFieldSchema = z
  .enum([
    "created_at",
    "updated_at",
    "nickname",
    "email",
    "status",
    "payment_method",
    "payment_status",
    "paid_at"
  ])
  .default("updated_at");

// ソート順序
export const SortOrderSchema = z
  .enum(["asc", "desc"])
  .default("desc");

// ページネーション
export const PageSchema = z
  .number()
  .int()
  .min(1)
  .default(1);

export const LimitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(50);

// 検索クエリ
export const SearchQuerySchema = z
  .string()
  .min(0)
  .max(255)
  .optional()
  .transform((val) => val?.trim() || undefined);

// 参加者一覧取得パラメータ
export const GetParticipantsParamsSchema = z.object({
  eventId: z.string().uuid(),
  search: SearchQuerySchema,
  attendanceStatus: AttendanceStatusFilterSchema,
  paymentMethod: PaymentMethodFilterSchema,
  paymentStatus: PaymentStatusFilterSchema,
  sortField: ParticipantSortFieldSchema,
  sortOrder: SortOrderSchema,
  page: PageSchema,
  limit: LimitSchema,
});

export type GetParticipantsParams = z.infer<typeof GetParticipantsParamsSchema>;

// CSVエクスポートパラメータ
export const ExportParticipantsCsvParamsSchema = z.object({
  eventId: z.string().uuid(),
  filters: z.object({
    search: SearchQuerySchema,
    attendanceStatus: AttendanceStatusFilterSchema,
    paymentMethod: PaymentMethodFilterSchema,
    paymentStatus: PaymentStatusFilterSchema,
  }).optional(),
  columns: z
    .array(z.enum([
      "attendance_id",
      "nickname",
      "email",
      "status",
      "payment_method",
      "payment_status",
      "amount",
      "paid_at",
      "created_at",
      "updated_at"
    ]))
    .optional()
    .default([
      "attendance_id",
      "nickname",
      "email",
      "status",
      "payment_method",
      "payment_status",
      "paid_at"
    ]),
});

export type ExportParticipantsCsvParams = z.infer<typeof ExportParticipantsCsvParamsSchema>;

// 一括現金ステータス更新パラメータ
export const BulkUpdateCashStatusParamsSchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1).max(50), // 一度に最大50件
  status: z.enum(["received", "waived"]),
  notes: z.string().max(500).optional(),
});

export type BulkUpdateCashStatusParams = z.infer<typeof BulkUpdateCashStatusParamsSchema>;

// 参加者詳細表示用型（attendances + payments結合）
export const ParticipantViewSchema = z.object({
  // attendance fields
  attendance_id: z.string(),
  nickname: z.string(),
  email: z.string(),
  attendance_status: z.enum(["attending", "not_attending", "maybe"]),
  attendance_created_at: z.string(),
  attendance_updated_at: z.string(),

  // payment fields (nullable - 決済情報がない場合もある)
  payment_id: z.string().nullable(),
  payment_method: z.enum(["stripe", "cash"]).nullable(),
  payment_status: z.enum(["pending", "paid", "failed", "received", "refunded", "waived", "completed"]).nullable(),
  amount: z.number().nullable(),
  paid_at: z.string().nullable(),
  payment_created_at: z.string().nullable(),
  payment_updated_at: z.string().nullable(),
});

export type ParticipantView = z.infer<typeof ParticipantViewSchema>;

// レスポンス型
export const GetParticipantsResponseSchema = z.object({
  participants: z.array(ParticipantViewSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  filters: z.object({
    search: z.string().optional(),
    attendanceStatus: AttendanceStatusFilterSchema,
    paymentMethod: PaymentMethodFilterSchema,
    paymentStatus: PaymentStatusFilterSchema,
  }),
  sort: z.object({
    field: ParticipantSortFieldSchema,
    order: SortOrderSchema,
  }),
});

export type GetParticipantsResponse = z.infer<typeof GetParticipantsResponseSchema>;
