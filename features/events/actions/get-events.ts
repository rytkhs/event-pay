"use server";

import { createClient } from "@core/supabase/server";
import { SortBy, SortOrder, StatusFilter, PaymentFilter } from "@core/types/events";

// Re-export types for component usage
export type { SortBy, SortOrder, StatusFilter, PaymentFilter };
import { convertJstDateToUtcRange } from "@core/utils/timezone";
import { dateFilterSchema, type DateFilterInput } from "@core/validation/event";

import type { Database } from "@/types/database";

import type { Event } from "../types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type EventWithAttendancesCount = EventRow & {
  attendances?: { count: number };
  public_profiles?: { name: string } | null;
};

export type DateFilter = DateFilterInput;

// 型安全なフィルター条件の定義
interface FilterCondition {
  field: string;
  operator: "eq" | "gt" | "gte" | "lte";
  value: string | number | boolean | null;
}

interface EqualityFilter {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | Database["public"]["Enums"]["event_status_enum"];
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

type GetEventsResult =
  | {
      success: true;
      data: Event[];
      totalCount: number;
      hasMore: boolean;
    }
  | {
      success: false;
      error: string;
    };

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
  try {
    const supabase = createClient();
    const {
      limit = 50,
      offset = 0,
      statusFilter = "all",
      paymentFilter = "all",
      dateFilter = {},
      sortBy = "date",
      sortOrder = "asc",
    } = options;

    // パラメータバリデーション
    if (sortOrder && !["asc", "desc"].includes(sortOrder)) {
      return {
        success: false,
        error: "sortOrderは'asc'または'desc'である必要があります",
      };
    }

    if (sortBy && !["date", "created_at", "attendances_count", "fee"].includes(sortBy)) {
      return {
        success: false,
        error:
          "sortByは'date', 'created_at', 'attendances_count', 'fee'のいずれかである必要があります",
      };
    }

    if (
      statusFilter &&
      !["all", "upcoming", "ongoing", "past", "cancelled"].includes(statusFilter)
    ) {
      return {
        success: false,
        error:
          "statusFilterは'all', 'upcoming', 'ongoing', 'past', 'cancelled'のいずれかである必要があります",
      };
    }

    if (paymentFilter && !["all", "free", "paid"].includes(paymentFilter)) {
      return {
        success: false,
        error: "paymentFilterは'all', 'free', 'paid'のいずれかである必要があります",
      };
    }

    // 日付フィルターのバリデーション
    if (dateFilter && Object.keys(dateFilter).length > 0) {
      const dateValidation = dateFilterSchema.safeParse(dateFilter);
      if (!dateValidation.success) {
        const errorMessage =
          dateValidation.error.errors[0]?.message || "日付フィルターの形式が正しくありません";
        return {
          success: false,
          error: errorMessage,
        };
      }
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    if (!user) {
      return {
        success: false,
        error: "認証が必要です",
      };
    }

    // 型安全なフィルター条件を構築
    const equalityFilters: EqualityFilter = {
      created_by: user.id,
    };

    const conditionFilters: FilterCondition[] = [];

    if (statusFilter !== "all") {
      equalityFilters.status = statusFilter;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (query: any) => {
      let result = query;

      // 等価フィルターを適用
      Object.entries(equalityFilters).forEach(([field, value]) => {
        result = result.eq(field, value);
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
            result = result.eq(field, value);
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
      status,
      created_by,
      created_at,
      public_profiles!events_created_by_fkey(name),
      attendances(count)
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
      eventsQuery = eventsQuery.order("date", { ascending: true });
      eventsQuery = eventsQuery.range(offset, offset + limit - 1);
    }

    const [countResult, eventsResult] = await Promise.all([
      applyFilters(supabase.from("events").select("*", { count: "exact", head: true })),
      eventsQuery,
    ]);

    const { count: totalCount, error: countError } = countResult;
    const { data: events, error: dbError } = eventsResult;

    if (countError) {
      return {
        success: false,
        error: "イベントの取得に失敗しました",
      };
    }

    if (dbError) {
      return {
        success: false,
        error: "イベントの取得に失敗しました",
      };
    }

    // JOINで取得した作成者名を使用（N+1問題を解決）
    let eventsData = (events || []).map((event: EventWithAttendancesCount) => {
      const creator_name = event.public_profiles?.name || "不明";

      return {
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location || "",
        fee: event.fee,
        capacity: event.capacity || 0,
        status: event.status as Database["public"]["Enums"]["event_status_enum"],
        creator_name,
        attendances_count: event.attendances?.count || 0,
        created_at: event.created_at,
      };
    });

    // 参加者数ソートの場合はクライアントサイドでソートとページネーション
    if (sortBy === "attendances_count") {
      eventsData = eventsData.sort((a: Event, b: Event) => {
        const aCount = a.attendances_count || 0;
        const bCount = b.attendances_count || 0;
        return sortOrder === "asc" ? aCount - bCount : bCount - aCount;
      });

      // ページネーションを適用
      eventsData = eventsData.slice(offset, offset + limit);
    }

    const hasMore = totalCount ? offset + limit < totalCount : false;

    return {
      success: true,
      data: eventsData,
      totalCount: totalCount || 0,
      hasMore,
    };
  } catch (_) {
    return {
      success: false,
      error: "予期しないエラーが発生しました",
    };
  }
}
