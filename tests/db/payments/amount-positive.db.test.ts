import { describe, expect } from "vitest";

import type { AppDatabase } from "@core/types/supabase";

import { PAID_EVENT_FEE, test } from "../../fixtures/payment";

/**
 * PAY-01: Payment金額は正の整数であり、返金額・手数料額は負数にならない。
 *
 * RLS を迂回する service_role からの直接操作でも CHECK 制約が最終防衛線になる。
 */

type PaymentInsert = AppDatabase["public"]["Tables"]["payments"]["Insert"];

const AMOUNT_COLUMNS =
  "amount, refunded_amount, application_fee_amount, application_fee_refunded_amount";

const AMOUNT_POSITIVE_CONSTRAINT = "chk_payments_amount_positive";

type NonNegativeColumn =
  | "amount"
  | "refunded_amount"
  | "application_fee_amount"
  | "application_fee_refunded_amount";

const NON_NEGATIVE_COLUMNS: Array<{
  column: NonNegativeColumn;
  constraint: string;
  initial: number;
}> = [
  { column: "amount", constraint: AMOUNT_POSITIVE_CONSTRAINT, initial: PAID_EVENT_FEE },
  {
    column: "refunded_amount",
    constraint: "chk_payments_refunded_amount_non_negative",
    initial: 0,
  },
  {
    column: "application_fee_amount",
    constraint: "chk_payments_application_fee_amount_non_negative",
    initial: 0,
  },
  {
    column: "application_fee_refunded_amount",
    constraint: "chk_payments_application_fee_refunded_amount_non_negative",
    initial: 0,
  },
];

function negative(column: NonNegativeColumn): Partial<PaymentInsert> {
  return { [column]: -1 };
}

describe("金額列の非負制約", () => {
  describe.each(NON_NEGATIVE_COLUMNS)("$column", ({ column, constraint, initial }) => {
    test("負数を指定した決済は作成できない", async ({ adminClient, payment }) => {
      const attendance = await payment.createAttendance();

      const { error } = await adminClient
        .from("payments")
        .insert(payment.buildPayment({ attendanceId: attendance.id, ...negative(column) }));

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(constraint);

      const { count, error: countError } = await adminClient
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("attendance_id", attendance.id);

      expect(countError).toBeNull();
      expect(count).toBe(0);
    });

    test("既存決済を負数へ更新できない", async ({ adminClient, cashPayment }) => {
      const { error } = await adminClient
        .from("payments")
        .update(negative(column))
        .eq("id", cashPayment.id);

      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(constraint);

      const { data, error: readError } = await adminClient
        .from("payments")
        .select(`${AMOUNT_COLUMNS}, version`)
        .eq("id", cashPayment.id)
        .single();

      expect(readError).toBeNull();
      expect(data?.[column]).toBe(initial);
      expect(data?.version).toBe(1);
    });
  });
});

/**
 * amount のみ 0 も禁止する。返金額・手数料額は 0 が正当な初期値であり、この制約の対象外。
 */
describe("amountの正数制約", () => {
  test("0円の決済は作成できない", async ({ adminClient, payment }) => {
    const attendance = await payment.createAttendance();

    const { error } = await adminClient
      .from("payments")
      .insert(payment.buildPayment({ attendanceId: attendance.id, amount: 0 }));

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(AMOUNT_POSITIVE_CONSTRAINT);

    const { count, error: countError } = await adminClient
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("attendance_id", attendance.id);

    expect(countError).toBeNull();
    expect(count).toBe(0);
  });

  test("既存決済を0円へ更新できない", async ({ adminClient, cashPayment }) => {
    const { error } = await adminClient
      .from("payments")
      .update({ amount: 0 })
      .eq("id", cashPayment.id);

    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(AMOUNT_POSITIVE_CONSTRAINT);

    const { data, error: readError } = await adminClient
      .from("payments")
      .select(`${AMOUNT_COLUMNS}, version`)
      .eq("id", cashPayment.id)
      .single();

    expect(readError).toBeNull();
    expect(data?.amount).toBe(PAID_EVENT_FEE);
    expect(data?.version).toBe(1);
  });
});
