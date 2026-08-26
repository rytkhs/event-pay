import { describe, expect } from "vitest";

import type { AppDatabase, AppSupabaseClient } from "@core/types/supabase";

import { test } from "../../fixtures/payment";

type PaymentStatus = AppDatabase["public"]["Enums"]["payment_status_enum"];

type StatusUpdateResult = {
  payment_id: string;
  status: PaymentStatus;
  new_version: number;
  updated_at: string;
};

type BulkUpdateResult = {
  success_count: number;
  failure_count: number;
  failures: Array<{
    payment_id: string;
    error_code: string;
    error_message: string;
  }>;
};

function updateCashStatus(
  client: AppSupabaseClient,
  input: { paymentId: string; status: PaymentStatus; expectedVersion: number; userId: string }
) {
  return client.rpc("rpc_update_payment_status_safe", {
    p_payment_id: input.paymentId,
    p_new_status: input.status,
    p_expected_version: input.expectedVersion,
    p_user_id: input.userId,
  });
}

describe("Paymentの楽観ロック", () => {
  test("更新前のversionを再利用するとPT409となり、先行更新を上書きしない", async ({
    cashPayment,
    organizer,
    organizerClient,
    payment,
  }) => {
    const first = await updateCashStatus(organizerClient, {
      paymentId: cashPayment.id,
      status: "received",
      expectedVersion: cashPayment.version,
      userId: organizer.id,
    });
    expect(first.error).toBeNull();

    const stale = await updateCashStatus(organizerClient, {
      paymentId: cashPayment.id,
      status: "waived",
      expectedVersion: cashPayment.version,
      userId: organizer.id,
    });

    expect(stale.error?.code).toBe("PT409");
    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe("received");
    expect(snapshot.version).toBe(cashPayment.version + 1);
  });

  test("同一versionの並行更新は1件だけ成功する", async ({
    cashPayment,
    organizer,
    organizerClient,
    payment,
  }) => {
    const results = await Promise.all([
      updateCashStatus(organizerClient, {
        paymentId: cashPayment.id,
        status: "received",
        expectedVersion: cashPayment.version,
        userId: organizer.id,
      }),
      updateCashStatus(organizerClient, {
        paymentId: cashPayment.id,
        status: "waived",
        expectedVersion: cashPayment.version,
        userId: organizer.id,
      }),
    ]);

    const successes = results.filter((result) => result.error === null);
    const failures = results.filter((result) => result.error !== null);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error?.code).toBe("PT409");

    const successfulResult = successes[0]?.data as StatusUpdateResult;
    const snapshot = await payment.readPayment(cashPayment.id);
    expect(snapshot.status).toBe(successfulResult.status);
    expect(snapshot.version).toBe(cashPayment.version + 1);
  });

  test("一括更新は競合を要素単位の失敗として返し、他の更新を継続する", async ({
    organizer,
    organizerClient,
    payment,
  }) => {
    const stalePayment = await payment.createPaymentWithAttendance({ method: "cash" });
    const validPayment = await payment.createPaymentWithAttendance({ method: "cash" });

    const first = await updateCashStatus(organizerClient, {
      paymentId: stalePayment.id,
      status: "received",
      expectedVersion: stalePayment.version,
      userId: organizer.id,
    });
    expect(first.error).toBeNull();

    const { data, error } = await organizerClient.rpc("rpc_bulk_update_payment_status_safe", {
      p_payment_updates: [
        {
          payment_id: stalePayment.id,
          expected_version: stalePayment.version,
          new_status: "waived",
        },
        {
          payment_id: validPayment.id,
          expected_version: validPayment.version,
          new_status: "received",
        },
      ],
      p_user_id: organizer.id,
    });

    expect(error).toBeNull();
    expect(data as BulkUpdateResult).toEqual({
      success_count: 1,
      failure_count: 1,
      failures: [
        {
          payment_id: stalePayment.id,
          error_code: "PT409",
          error_message: expect.stringContaining("Concurrent update detected"),
        },
      ],
    });

    const staleSnapshot = await payment.readPayment(stalePayment.id);
    expect(staleSnapshot.status).toBe("received");
    expect(staleSnapshot.version).toBe(stalePayment.version + 1);

    const validSnapshot = await payment.readPayment(validPayment.id);
    expect(validSnapshot.status).toBe("received");
    expect(validSnapshot.version).toBe(validPayment.version + 1);
  });
});
