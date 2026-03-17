import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { EventRow } from "@core/types/event";
import {
  SortBy,
  SortOrder,
  StatusFilter,
  PaymentFilter,
  DateFilter,
} from "@core/types/event-query";
import type { AttendanceStatus } from "@core/types/statuses";
import type { AppSupabaseClient } from "@core/types/supabase";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { convertJstDateToUtcRange } from "@core/utils/timezone";
import { dateFilterSchema } from "@core/validation/event";

import type { EventListItem } from "../types";

type EventWithAttendancesCount = Pick<
  EventRow,
  "id" | "title" | "date" | "location" | "fee" | "capacity" | "created_at" | "canceled_at"
> & {
  attendances?: { status: AttendanceStatus }[];
};

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

type ValidatedGetEventsOptions = {
  limit: number;
  offset: number;
  statusFilter: StatusFilter;
  paymentFilter: PaymentFilter;
  dateFilter: DateFilter;
  sortBy: SortBy;
  sortOrder: SortOrder;
};

export type GetEventsOptions = {
  limit?: number;
  offset?: number;
  statusFilter?: StatusFilter;
  paymentFilter?: PaymentFilter;
  dateFilter?: DateFilter;
  sortBy?: SortBy;
  sortOrder?: SortOrder;
};

export type GetEventsData = {
  items: EventListItem[];
  totalCount: number;
  hasMore: boolean;
};

function validationError(field: string, userMessage: string): AppResult<never> {
  return errResult(
    new AppError("VALIDATION_ERROR", {
      userMessage,
      details: { [field]: userMessage },
      retryable: false,
    })
  );
}

function validateGetEventsOptions(
  options: GetEventsOptions = {}
): AppResult<ValidatedGetEventsOptions> {
  const normalizedOptions: ValidatedGetEventsOptions = {
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
    statusFilter: options.statusFilter ?? "all",
    paymentFilter: options.paymentFilter ?? "all",
    dateFilter: options.dateFilter ?? {},
    sortBy: options.sortBy ?? "date",
    sortOrder: options.sortOrder ?? "desc",
  };

  if (!["asc", "desc"].includes(normalizedOptions.sortOrder)) {
    return validationError("sortOrder", "sortOrderは'asc'または'desc'である必要があります");
  }

  if (!["date", "created_at", "attendances_count", "fee"].includes(normalizedOptions.sortBy)) {
    return validationError(
      "sortBy",
      "sortByは'date', 'created_at', 'attendances_count', 'fee'のいずれかである必要があります"
    );
  }

  if (
    !["all", "upcoming", "ongoing", "past", "canceled"].includes(normalizedOptions.statusFilter)
  ) {
    return validationError(
      "statusFilter",
      "statusFilterは'all', 'upcoming', 'ongoing', 'past', 'canceled'のいずれかである必要があります"
    );
  }

  if (!["all", "free", "paid"].includes(normalizedOptions.paymentFilter)) {
    return validationError(
      "paymentFilter",
      "paymentFilterは'all', 'free', 'paid'のいずれかである必要があります"
    );
  }

  if (Object.keys(normalizedOptions.dateFilter).length > 0) {
    const dateValidation = dateFilterSchema.safeParse(normalizedOptions.dateFilter);
    if (!dateValidation.success) {
      const errorMessage =
        dateValidation.error.errors[0]?.message || "日付フィルターの形式が正しくありません";
      return validationError("dateFilter", errorMessage);
    }
  }

  return okResult(normalizedOptions);
}

function getOrderColumn(sortBy: SortBy): string | null {
  switch (sortBy) {
    case "date":
      return "date";
    case "created_at":
      return "created_at";
    case "attendances_count":
      return "attendances_count";
    case "fee":
      return "fee";
    default:
      return "date";
  }
}

export async function listEventsForCommunity(
  supabase: AppSupabaseClient,
  communityId: string,
  options: GetEventsOptions = {}
): Promise<AppResult<GetEventsData>> {
  const validatedOptions = validateGetEventsOptions(options);

  if (!validatedOptions.success || !validatedOptions.data) {
    return validatedOptions as AppResult<GetEventsData>;
  }

  const { limit, offset, statusFilter, paymentFilter, dateFilter, sortBy, sortOrder } =
    validatedOptions.data;

  try {
    const equalityFilters: EqualityFilter = {
      community_id: communityId,
    };

    const conditionFilters: FilterCondition[] = [];

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

    if (paymentFilter === "free") {
      equalityFilters.fee = 0;
    } else if (paymentFilter === "paid") {
      conditionFilters.push({
        field: "fee",
        operator: "gt",
        value: 0,
      });
    }

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

    const applyFilters = <T extends FilterableQuery<T>>(query: T): T => {
      let result = query;

      Object.entries(equalityFilters).forEach(([field, value]) => {
        if (value === null) {
          result = result.is(field, null);
        } else {
          result = result.eq(field, value);
        }
      });

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
            throw new Error(`Unsupported operator: ${operator}`);
        }
      });

      return result;
    };

    const orderColumn = getOrderColumn(sortBy);

    let eventsQuery = applyFilters(
      supabase.from("events").select(`
      id,
      title,
      date,
      location,
      fee,
      capacity,
      created_at,
      canceled_at,
      attendances!left(status)
    `)
    );

    if (orderColumn && sortBy !== "attendances_count") {
      eventsQuery = eventsQuery.order(orderColumn, { ascending: sortOrder === "asc" });
      eventsQuery = eventsQuery.range(offset, offset + limit - 1);
    } else if (sortBy === "attendances_count") {
      eventsQuery = eventsQuery.order("id");
    } else {
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
      const attendancesCount = event.attendances
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
        attendances_count: attendancesCount,
        created_at: event.created_at,
      };
    });

    if (sortBy === "attendances_count") {
      eventsData = eventsData.sort((a: EventListItem, b: EventListItem) => {
        const aCount = a.attendances_count || 0;
        const bCount = b.attendances_count || 0;
        return sortOrder === "asc" ? aCount - bCount : bCount - aCount;
      });
      eventsData = eventsData.slice(offset, offset + limit);
    }

    const hasMore = totalCount ? offset + limit < totalCount : false;

    return okResult({
      items: eventsData,
      totalCount: totalCount || 0,
      hasMore,
    });
  } catch (error) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        userMessage: "イベント一覧の取得に失敗しました",
        retryable: true,
      })
    );
  }
}
