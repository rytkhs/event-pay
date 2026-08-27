import { assert, describe, expect } from "vitest";

import {
  bulkUpdateCashStatusAction,
  updateCashStatusAction,
} from "@/app/(app)/events/[id]/participants/actions";

import { test } from "../../fixtures/payment";
import { runInNextServerActionContext } from "../../setup/next-request-context";

describe("現金決済更新Server Action", () => {
  test("表示後に更新された単件PaymentはRESOURCE_CONFLICTとなり、先行更新を上書きしない", async ({
    cashPayment,
    organizer,
    organizerClient,
    organizerRequestCookies,
    payment,
  }) => {
    const firstUpdate = await organizerClient.rpc("rpc_update_payment_status_safe", {
      p_payment_id: cashPayment.id,
      p_new_status: "received",
      p_expected_version: cashPayment.version,
      p_user_id: organizer.id,
    });
    expect(firstUpdate.error).toBeNull();

    const execution = await runInNextServerActionContext({ cookies: organizerRequestCookies }, () =>
      updateCashStatusAction({
        paymentId: cashPayment.id,
        expectedVersion: cashPayment.version,
        status: "waived",
      })
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("RESOURCE_CONFLICT");

    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("received");
    expect(snapshot.version).toBe(cashPayment.version + 1);
  });

  test("一括更新は入力versionを使い、競合したPaymentだけを失敗にする", async ({
    organizer,
    organizerClient,
    organizerRequestCookies,
    payment,
  }) => {
    const stalePayment = await payment.createPaymentWithAttendance({ method: "cash" });
    const validPayment = await payment.createPaymentWithAttendance({ method: "cash" });

    const firstUpdate = await organizerClient.rpc("rpc_update_payment_status_safe", {
      p_payment_id: stalePayment.id,
      p_new_status: "received",
      p_expected_version: stalePayment.version,
      p_user_id: organizer.id,
    });
    expect(firstUpdate.error).toBeNull();

    const execution = await runInNextServerActionContext({ cookies: organizerRequestCookies }, () =>
      bulkUpdateCashStatusAction({
        payments: [
          { paymentId: stalePayment.id, expectedVersion: stalePayment.version },
          { paymentId: validPayment.id, expectedVersion: validPayment.version },
        ],
        status: "waived",
      })
    );

    expect(execution.result.success).toBe(true);
    assert(execution.result.success);
    expect(execution.result.data.successCount).toBe(1);
    expect(execution.result.data.failedCount).toBe(1);
    expect(execution.result.data.failures).toEqual([
      expect.objectContaining({
        paymentId: stalePayment.id,
        code: "RESOURCE_CONFLICT",
      }),
    ]);

    const staleSnapshot = await payment.readPayment(stalePayment.id);
    const validSnapshot = await payment.readPayment(validPayment.id);
    expect(staleSnapshot.status).toBe("received");
    expect(validSnapshot.status).toBe("waived");
  });

  test("versionがない単件入力はDB更新前にVALIDATION_ERRORとなる", async ({
    cashPayment,
    organizerRequestCookies,
    payment,
  }) => {
    const execution = await runInNextServerActionContext({ cookies: organizerRequestCookies }, () =>
      updateCashStatusAction({
        paymentId: cashPayment.id,
        status: "received",
      })
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("VALIDATION_ERROR");
    expect(await payment.readPayment(cashPayment.id)).toMatchObject({
      status: "pending",
      version: cashPayment.version,
    });
  });
});
