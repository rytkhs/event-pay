import {
  SIMPLE_PAYMENT_STATUS_VALUES,
  type SimplePaymentStatus,
} from "@core/utils/payment-status-mapper";

export const EVENT_MANAGEMENT_TABS = ["overview", "participants"] as const;
export type EventManagementTab = (typeof EVENT_MANAGEMENT_TABS)[number];

export const PARTICIPANT_ATTENDANCE_FILTERS = [
  "all",
  "attending",
  "maybe",
  "not_attending",
] as const;
export type ParticipantAttendanceFilter = (typeof PARTICIPANT_ATTENDANCE_FILTERS)[number];

export const PARTICIPANT_SORT_FIELDS = ["created_at", "nickname", "status", "updated_at"] as const;
export type ParticipantSortField = (typeof PARTICIPANT_SORT_FIELDS)[number];

export const PARTICIPANT_SORT_ORDERS = ["asc", "desc"] as const;
export type ParticipantSortOrder = (typeof PARTICIPANT_SORT_ORDERS)[number];

export const PARTICIPANT_LIMIT_OPTIONS = [50, 100, 150, 200] as const;

export type RawSearchParams = { [key: string]: string | string[] | undefined };

type PaymentMethodFilter = "stripe" | "cash";

export interface EventManagementQuery {
  tab: EventManagementTab;
  search: string;
  attendance: ParticipantAttendanceFilter;
  paymentMethod?: PaymentMethodFilter;
  paymentStatus?: SimplePaymentStatus;
  smart: boolean;
  sort?: ParticipantSortField;
  order?: ParticipantSortOrder;
  page: number;
  limit: number;
}

export interface EventManagementQueryPatch {
  tab?: EventManagementTab;
  search?: string;
  attendance?: ParticipantAttendanceFilter;
  paymentMethod?: PaymentMethodFilter;
  paymentStatus?: SimplePaymentStatus;
  smart?: boolean;
  sort?: ParticipantSortField;
  order?: ParticipantSortOrder;
  page?: number;
  limit?: number;
}

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isEventManagementTab(value: string | undefined): value is EventManagementTab {
  return EVENT_MANAGEMENT_TABS.includes(value as EventManagementTab);
}

function isAttendanceFilter(value: string | undefined): value is ParticipantAttendanceFilter {
  return PARTICIPANT_ATTENDANCE_FILTERS.includes(value as ParticipantAttendanceFilter);
}

function isPaymentMethodFilter(value: string | undefined): value is PaymentMethodFilter {
  return value === "stripe" || value === "cash";
}

function isSimplePaymentStatus(value: string | undefined): value is SimplePaymentStatus {
  return SIMPLE_PAYMENT_STATUS_VALUES.includes(value as SimplePaymentStatus);
}

function isParticipantSortField(value: string | undefined): value is ParticipantSortField {
  return PARTICIPANT_SORT_FIELDS.includes(value as ParticipantSortField);
}

function isParticipantSortOrder(value: string | undefined): value is ParticipantSortOrder {
  return PARTICIPANT_SORT_ORDERS.includes(value as ParticipantSortOrder);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseLimit(value: string | undefined): number {
  const parsed = parsePositiveInteger(value, 150);
  return PARTICIPANT_LIMIT_OPTIONS.includes(parsed as (typeof PARTICIPANT_LIMIT_OPTIONS)[number])
    ? parsed
    : 150;
}

export function parseEventManagementQuery(searchParams: RawSearchParams): EventManagementQuery {
  const rawTab = getSingleValue(searchParams.tab);
  const rawSearch = getSingleValue(searchParams.search);
  const rawAttendance = getSingleValue(searchParams.attendance);
  const rawPaymentMethod = getSingleValue(searchParams.payment_method);
  const rawPaymentStatus = getSingleValue(searchParams.payment_status);
  const rawSmart = getSingleValue(searchParams.smart);
  const rawSort = getSingleValue(searchParams.sort);
  const rawOrder = getSingleValue(searchParams.order);
  const rawPage = getSingleValue(searchParams.page);
  const rawLimit = getSingleValue(searchParams.limit);

  const sort = isParticipantSortField(rawSort) ? rawSort : undefined;
  const order = isParticipantSortOrder(rawOrder) ? rawOrder : undefined;

  return {
    tab: isEventManagementTab(rawTab) ? rawTab : "overview",
    search: normalizeString(rawSearch) ?? "",
    attendance: isAttendanceFilter(rawAttendance) ? rawAttendance : "all",
    paymentMethod: isPaymentMethodFilter(rawPaymentMethod) ? rawPaymentMethod : undefined,
    paymentStatus: isSimplePaymentStatus(rawPaymentStatus) ? rawPaymentStatus : undefined,
    smart: rawSmart === "1",
    sort,
    order: sort ? (order ?? "desc") : undefined,
    page: parsePositiveInteger(rawPage, 1),
    limit: parseLimit(rawLimit),
  };
}

function shouldResetPage(patch: EventManagementQueryPatch): boolean {
  return [
    "search",
    "attendance",
    "paymentMethod",
    "paymentStatus",
    "smart",
    "sort",
    "order",
    "limit",
  ].some((key) => key in patch);
}

function setOptionalString(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
  emptyValue?: string
) {
  if (!value || (emptyValue !== undefined && value === emptyValue)) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}

export function buildEventManagementSearchParams(
  currentSearch: string,
  patch: EventManagementQueryPatch
): URLSearchParams {
  const params = new URLSearchParams(currentSearch);

  if ("tab" in patch) {
    setOptionalString(params, "tab", patch.tab, "overview");
  }

  if ("search" in patch) {
    setOptionalString(params, "search", normalizeString(patch.search));
  }

  if ("attendance" in patch) {
    setOptionalString(params, "attendance", patch.attendance, "all");
  }

  if ("paymentMethod" in patch) {
    setOptionalString(params, "payment_method", patch.paymentMethod);
  }

  if ("paymentStatus" in patch) {
    setOptionalString(params, "payment_status", patch.paymentStatus);
  }

  if ("smart" in patch) {
    if (patch.smart) {
      params.set("smart", "1");
    } else {
      params.delete("smart");
    }
  }

  if ("sort" in patch) {
    setOptionalString(params, "sort", patch.sort);
  }

  if ("order" in patch) {
    setOptionalString(params, "order", patch.order);
  }

  if (shouldResetPage(patch) && !("page" in patch)) {
    params.delete("page");
  }

  if ("page" in patch) {
    const page = patch.page;
    if (page === undefined || page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
  }

  if ("limit" in patch) {
    const limit = patch.limit;
    if (limit === undefined || limit === 150) {
      params.delete("limit");
    } else {
      params.set("limit", String(limit));
    }
  }

  return params;
}
