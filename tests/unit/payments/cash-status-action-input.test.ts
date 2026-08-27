import { randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  bulkUpdateCashStatusActionInputSchema,
  updateCashStatusActionInputSchema,
} from "@features/payments";

const paymentId = randomUUID();

describe("現金決済更新Actionの入力契約", () => {
  test.each([{}, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: "1" }])(
    "単件の不正なversion (%j) を拒否する",
    (versionInput) => {
      const result = updateCashStatusActionInputSchema.safeParse({
        paymentId,
        status: "received",
        ...versionInput,
      });

      expect(result.success).toBe(false);
    }
  );

  test("単件のversion 0を受け付ける", () => {
    const result = updateCashStatusActionInputSchema.safeParse({
      paymentId,
      expectedVersion: 0,
      status: "received",
    });

    expect(result.success).toBe(true);
  });

  test("一括入力はPayment IDとversionの対応を保持する", () => {
    const result = bulkUpdateCashStatusActionInputSchema.safeParse({
      payments: [
        { paymentId, expectedVersion: 3 },
        { paymentId: randomUUID(), expectedVersion: 7 },
      ],
      status: "waived",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payments[0]).toEqual({ paymentId, expectedVersion: 3 });
    }
  });

  test("一括入力の重複Payment IDを拒否する", () => {
    const result = bulkUpdateCashStatusActionInputSchema.safeParse({
      payments: [
        { paymentId, expectedVersion: 3 },
        { paymentId, expectedVersion: 4 },
      ],
      status: "received",
    });

    expect(result.success).toBe(false);
  });

  test("旧形式のpaymentIds入力を受け付けない", () => {
    const result = bulkUpdateCashStatusActionInputSchema.safeParse({
      paymentIds: [paymentId],
      status: "received",
    });

    expect(result.success).toBe(false);
  });
});
