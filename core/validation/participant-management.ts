/**
 * 参加者管理機能 バリデーションスキーマ
 * MANAGE-001: 参加者一覧表示（検索/フィルター/ページング）
 */

import { z } from "zod";

// ====================================================================
// 決済ステータス ENUM（集中定義）- 先頭で定義して他から参照可能にする
// ====================================================================

// 決済ステータス ENUM（集中定義）
export const PaymentStatusEnum = z.enum([
  "pending",
  "paid",
  "failed",
  "received",
  "refunded",
  "waived",
  "completed",
]);

// 利便性のために値配列をエクスポート（runtime 用）
export const PAYMENT_STATUS_VALUES = PaymentStatusEnum.options;

// 参加ステータスフィルター（内部専用）
const AttendanceStatusFilterSchema = z.enum(["attending", "not_attending", "maybe"]).optional();

// 決済方法フィルター（内部専用）
const PaymentMethodFilterSchema = z.enum(["stripe", "cash"]).optional();

// UI用決済ステータスフィルター（内部専用） - SimplePaymentStatus
const SimplePaymentStatusFilterSchema = z.enum(["unpaid", "paid", "refunded", "waived"]).optional();

// ソートフィールド（内部専用）
const ParticipantSortFieldSchema = z
  .enum([
    "created_at",
    "updated_at",
    "nickname",
    "email",
    "status",
    "payment_method",
    "payment_status",
    "paid_at",
  ])
  .default("updated_at");

// ソート順序（内部専用）
const SortOrderSchema = z.enum(["asc", "desc"]).default("desc");

// ページネーション（内部専用）
const PageSchema = z.number().int().min(1).default(1);

const LimitSchema = z.number().int().min(1).max(200).default(100);

// 検索クエリ（内部専用）
const SearchQuerySchema = z
  .string()
  .max(255)
  .optional()
  .transform((val) => val?.trim() || undefined);

// 参加者一覧取得パラメータ
export const GetParticipantsParamsSchema = z.object({
  eventId: z.string().uuid(),
  search: SearchQuerySchema,
  attendanceStatus: AttendanceStatusFilterSchema,
  paymentMethod: PaymentMethodFilterSchema,
  paymentStatus: SimplePaymentStatusFilterSchema, // SimplePaymentStatusを使用
  sortField: ParticipantSortFieldSchema,
  sortOrder: SortOrderSchema,
  page: PageSchema,
  limit: LimitSchema,
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
    .default(["nickname", "status", "payment_method", "payment_status", "paid_at"]),
});

export type ExportParticipantsCsvParams = z.infer<typeof ExportParticipantsCsvParamsSchema>;

// 全件選択用（現金決済の最新レコードに限定）パラメータ
export const GetAllCashPaymentIdsParamsSchema = z.object({
  eventId: z.string().uuid(),
  filters: z
    .object({
      search: SearchQuerySchema,
      attendanceStatus: AttendanceStatusFilterSchema,
      // paymentMethod はサーバー側で cash を強制するため受け取らない
      paymentStatus: SimplePaymentStatusFilterSchema, // SimplePaymentStatusを使用
    })
    .optional(),
  // 取得上限（+1 で打ち切り判定に利用）。過度なメモリ消費を避けるため 5000 に制限
  max: z.number().int().min(1).max(5000).default(5000),
});

export type GetAllCashPaymentIdsParams = z.infer<typeof GetAllCashPaymentIdsParamsSchema>;

export const GetAllCashPaymentIdsResponseSchema = z
  .object({
    success: z.literal(true),
    paymentIds: z.array(z.string().uuid()),
    total: z.number().int().min(0),
    matchedTotal: z.number().int().min(0).optional(),
    truncated: z.boolean().optional(),
  })
  .or(
    z.object({
      success: z.literal(false),
      error: z.string(),
    })
  );

export type GetAllCashPaymentIdsResponse = z.infer<typeof GetAllCashPaymentIdsResponseSchema>;

// 一括現金ステータス更新パラメータ
export const BulkUpdateCashStatusParamsSchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1).max(50), // 一度に最大50件
  status: z.enum(["received", "waived"]),
  notes: z.string().max(500).optional(),
});

export type BulkUpdateCashStatusParams = z.infer<typeof BulkUpdateCashStatusParamsSchema>;

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
  payment_status: PaymentStatusEnum.nullable(),
  amount: z.number().nullable(),
  paid_at: z.string().nullable(),
  payment_version: z.number().nullable(), // 楽観的ロック用
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
    paymentStatus: SimplePaymentStatusFilterSchema, // SimplePaymentStatusを使用
  }),
  sort: z.object({
    field: ParticipantSortFieldSchema,
    order: SortOrderSchema,
  }),
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
  status: PaymentStatusEnum,
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

  // 決済済み（paid, received, completed）
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
      status: PaymentStatusEnum,
      attendance_id: z.string(),
      paid_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    })
  ),
  summary: PaymentSummarySchema,
});

export type GetEventPaymentsResponse = z.infer<typeof GetEventPaymentsResponseSchema>;
