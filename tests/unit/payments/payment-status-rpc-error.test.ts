import { describe, expect, it } from "vitest";

import {
  isConcurrentPaymentStatusUpdateError,
  PAYMENT_STATUS_CONCURRENT_UPDATE_SQLSTATE,
} from "../../../features/payments/services/status-update/payment-status-rpc-error";

describe("isConcurrentPaymentStatusUpdateError", () => {
  it("PT409を楽観ロック競合として判定する", () => {
    expect(PAYMENT_STATUS_CONCURRENT_UPDATE_SQLSTATE).toBe("PT409");
    expect(isConcurrentPaymentStatusUpdateError({ code: "PT409" })).toBe(true);
  });

  it.each(["40001", "P0001", "23505", undefined])("%sを楽観ロック競合として扱わない", (code) => {
    expect(isConcurrentPaymentStatusUpdateError({ code })).toBe(false);
  });
});
