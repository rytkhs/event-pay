import { fail, ok, type ActionResult } from "@core/errors/adapters/server-actions";
import type { ErrorCode } from "@core/errors/types";
import { generateSecureUuid } from "@core/security/crypto";
import { createClient } from "@core/supabase/server";
import type { EventRow } from "@core/types/event";
import {
  SortBy,
  SortOrder,
  StatusFilter,
  PaymentFilter,
  DateFilter,
} from "@core/types/event-query";
import type { AttendanceStatus } from "@core/types/statuses";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { handleServerError } from "@core/utils/error-handler.server";
import { convertJstDateToUtcRange } from "@core/utils/timezone";
import { dateFilterSchema } from "@core/validation/event";

import type { EventListItem } from "../types";

type EventWithAttendancesCount = Pick<
  EventRow,
  | "id"
  | "title"
  | "date"
  | "location"
  | "fee"
  | "capacity"
  | "created_by"
  | "created_at"
  | "canceled_at"
> & {
  attendances?: { status: AttendanceStatus }[];
};

// 型安全なフィルター条件の定義
interface FilterCondition {
  field: string;
  operator: "eq" | "gt" | "gte" | "lte" | "neq";
  value: string | number | boolean | null;
}

interface EqualityFilter {
  [key: string]: string | number | boolean | null | "upcoming" | "ongoing" | "past" | "canceled";
}

interface FilterableQuery<T> {
  eq(column: string, value: unknown): T;
  neq(column: string, value: unknown): T;
  is(column: string, value: null): T;
  not(column: string, operator: string, value: unknown): T;
  gt(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
}

type GetEventsOptions = {
  limit?: number;
  offset?: number;
  statusFilter?: StatusFilter;
  paymentFilter?: PaymentFilter;
  dateFilter?: DateFilter;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
};

type GetEventsResult = ActionResult<{
  items: EventListItem[];
  totalCount: number;
  hasMore: boolean;
}>;

// ソート項目をSupabaseのカラム名にマッピング
function getOrderColumn(sortBy: SortBy): string | null {
  switch (sortBy) {
    case "date":
      return "date";
    case "created_at":
      return "created_at";
    case "attendances_count":
      return "attendances_count"; // サーバーサイドソートを使用
    case "fee":
      return "fee";
    default:
      return "date";
  }
}

export async function getEventsAction(options: GetEventsOptions = {}): Promise<GetEventsResult> {
  const correlationId = `get_events_${generateSecureUuid()}`;
  try {
    const supabase = createClient();
    const {
      limit = 50,
      offset = 0,
      statusFilter = "all",
      paymentFilter = "all",
      dateFilter = {},
      sortBy = "date",
      sortOrder = "desc",
    } = options;

    // パラメータバリデーション
    if (sortOrder && !["asc", "desc"].includes(sortOrder)) {
      return fail("VALIDATION_ERROR", {
        userMessage: "sortOrderは'asc'または'desc'である必要があります",
      });
    }

    if (sortBy && !["date", "created_at", "attendances_count", "fee"].includes(sortBy)) {
      return fail("VALIDATION_ERROR", {
        userMessage:
          "sortByは'date', 'created_at', 'attendances_count', 'fee'のいずれかである必要があります",
      });
    }

    if (
      statusFilter &&
      !["all", "upcoming", "ongoing", "past", "canceled"].includes(statusFilter)
    ) {
      return fail("VALIDATION_ERROR", {
        userMessage:
          "statusFilterは'all', 'upcoming', 'ongoing', 'past', 'canceled'のいずれかである必要があります",
      });
    }

    if (paymentFilter && !["all", "free", "paid"].includes(paymentFilter)) {
      return fail("VALIDATION_ERROR", {
        userMessage: "paymentFilterは'all', 'free', 'paid'のいずれかである必要があります",
      });
    }

    // 日付フィルターのバリデーション
    if (dateFilter && Object.keys(dateFilter).length > 0) {
      const dateValidation = dateFilterSchema.safeParse(dateFilter);
      if (!dateValidation.success) {
        const errorMessage =
          dateValidation.error.errors[0]?.message || "日付フィルターの形式が正しくありません";
        return fail("VALIDATION_ERROR", { userMessage: errorMessage });
      }
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    // 型安全なフィルター条件を構築
    const equalityFilters: EqualityFilter = {
      created_by: user.id,
    };

    const conditionFilters: FilterCondition[] = [];

    // ステータスフィルター（都度算出）
    const nowIso = new Date().toISOString();
    const thresholdIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    if (statusFilter === "upcoming") {
      conditionFilters.push({ field: "canceled_at", operator: "eq", value: null });
      conditionFilters.push({ field: "date", operator: "gt", value: nowIso });
    } else if (statusFilter === "ongoing") {
      conditionFilters.push({ field: "canceled_at", operator: "eq", value: null });
      conditionFilters.push({ field: "date", operator: "lte", value: nowIso });
      conditionFilters.push({ field: "date", operator: "gt", value: thresholdIso });
    } else if (statusFilter === "past") {
      conditionFilters.push({ field: "canceled_at", operator: "eq", value: null });
      conditionFilters.push({ field: "date", operator: "lte", value: thresholdIso });
    } else if (statusFilter === "canceled") {
      conditionFilters.push({ field: "canceled_at", operator: "neq", value: null });
    }

    if (paymentFilter !== "all") {
      if (paymentFilter === "free") {
        equalityFilters.fee = 0;
      } else if (paymentFilter === "paid") {
        conditionFilters.push({
          field: "fee",
          operator: "gt",
          value: 0,
        });
      }
    }

    // タイムゾーン変換ユーティリティを使用した日付フィルター
    if (dateFilter.start) {
      const { startOfDay } = convertJstDateToUtcRange(dateFilter.start);
      conditionFilters.push({
        field: "date",
        operator: "gte",
        value: startOfDay.toISOString(),
      });
    }

    if (dateFilter.end) {
      const { endOfDay } = convertJstDateToUtcRange(dateFilter.end);
      conditionFilters.push({
        field: "date",
        operator: "lte",
        value: endOfDay.toISOString(),
      });
    }

    // 型安全なフィルター条件を適用する関数
    const applyFilters = <T extends FilterableQuery<T>>(query: T): T => {
      let result = query;

      // 等価フィルターを適用
      Object.entries(equalityFilters).forEach(([field, value]) => {
        if (value === null) {
          result = result.is(field, null);
        } else {
          result = result.eq(field, value);
        }
      });

      // 条件フィルターを適用
      conditionFilters.forEach(({ field, operator, value }) => {
        switch (operator) {
          case "gt":
            result = result.gt(field, value);
            break;
          case "gte":
            result = result.gte(field, value);
            break;
          case "lte":
            result = result.lte(field, value);
            break;
          case "eq":
            if (value === null) {
              result = result.is(field, null);
            } else {
              result = result.eq(field, value);
            }
            break;
          case "neq":
            if (value === null) {
              result = result.not(field, "is", null);
            } else {
              result = result.neq(field, value);
            }
            break;
          default:
            // TypeScriptの型チェックにより到達不可能
            throw new Error(`Unsupported operator: ${operator}`);
        }
      });

      return result;
    };

    // 最適化されたクエリ: 総件数とイベントデータを並行取得
    const orderColumn = getOrderColumn(sortBy);

    let eventsQuery = applyFilters(
      supabase.from("events").select(`
      id,
      title,
      date,
      location,
      fee,
      capacity,
      created_by,
      created_at,
      canceled_at,
      attendances!left(status)
    `)
    );

    // 参加者数ソート以外の場合のみサーバーサイドソートを適用
    if (orderColumn && sortBy !== "attendances_count") {
      eventsQuery = eventsQuery.order(orderColumn, { ascending: sortOrder === "asc" });
      eventsQuery = eventsQuery.range(offset, offset + limit - 1);
    } else if (sortBy === "attendances_count") {
      // 参加者数ソートの場合は全データを取得して後でソート
      eventsQuery = eventsQuery.order("id"); // 一意のソートキーとしてidを使用
    } else {
      // デフォルトソート
      eventsQuery = eventsQuery.order("date", { ascending: false });
      eventsQuery = eventsQuery.range(offset, offset + limit - 1);
    }

    const [countResult, eventsResult] = await Promise.all([
      applyFilters(supabase.from("events").select("*", { count: "exact", head: true })),
      eventsQuery,
    ]);

    const { count: totalCount, error: countError } = countResult;
    const { data: events, error: dbError } = eventsResult;

    if (countError) {
      throw countError;
    }

    if (dbError) {
      throw dbError;
    }

    let eventsData = (events || []).map((event: EventWithAttendancesCount) => {
      const computedStatus = deriveEventStatus(event.date, event.canceled_at ?? null);

      // status = 'attending' の参加者のみをカウント
      const attendances_count = event.attendances
        ? event.attendances.filter((attendance) => attendance.status === "attending").length
        : 0;

      return {
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        fee: event.fee,
        capacity: event.capacity,
        status: computedStatus,
        attendances_count,
        created_at: event.created_at,
      };
    });

    // 参加者数ソートの場合はクライアントサイドでソートとページネーション
    if (sortBy === "attendances_count") {
      eventsData = eventsData.sort((a: EventListItem, b: EventListItem) => {
        const aCount = a.attendances_count || 0;
        const bCount = b.attendances_count || 0;
        return sortOrder === "asc" ? aCount - bCount : bCount - aCount;
      });

      // ページネーションを適用
      eventsData = eventsData.slice(offset, offset + limit);
    }

    const hasMore = totalCount ? offset + limit < totalCount : false;

    return ok({
      items: eventsData,
      totalCount: totalCount || 0,
      hasMore,
    });
  } catch (error) {
    const errorDetails = handleServerError(error, {
      category: "event_management",
      action: "get_events",
      actorType: "user",
      additionalData: {
        correlation_id: correlationId,
        filters: options,
      },
    });

    return fail(errorDetails.code as ErrorCode, {
      userMessage: errorDetails.userMessage,
      correlationId,
      retryable: errorDetails.retryable,
    });
  }
}
