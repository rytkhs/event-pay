export const PAYMENTS_ORDER_PAID_AT_DESC_NULLS_LAST = {
  foreignTable: "payments",
  ascending: false,
  nullsFirst: false,
} as const;

export const PAYMENTS_ORDER_CREATED_AT_DESC = {
  foreignTable: "payments",
  ascending: false,
} as const;

export const PAYMENTS_ORDER_UPDATED_AT_DESC = {
  foreignTable: "payments",
  ascending: false,
} as const;

export const PAYMENTS_LIMIT_ONE = {
  foreignTable: "payments",
} as const;
