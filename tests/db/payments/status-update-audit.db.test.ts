import { describe, expect } from "vitest";

import { test } from "../../fixtures/payment";

/**
 * CSH-06: 更新成功時にactor、対象、旧新状態を監査可能にする（DB側）。
 *
 * 監査ログはRPCと同じトランザクションで書かれるため、更新が拒否された場合は
 * ログも残らない。
 */

describe("現金決済更新の監査ログ", () => {
  test("更新成功時に操作者と旧新状態が記録される", async ({
    adminClient,
    cashPayment,
    organizer,
    organizerClient,
  }) => {
    const { error } = await organizerClient.rpc("rpc_update_payment_status_safe", {
      p_payment_id: cashPayment.id,
      p_new_status: "received",
      p_expected_version: cashPayment.version,
      p_user_id: organizer.id,
    });

    expect(error).toBeNull();

    const { data, error: readError } = await adminClient
      .from("system_logs")
      .select("log_category, action, actor_type, user_id, resource_type, outcome, metadata")
      .eq("resource_id", cashPayment.id);

    expect(readError).toBeNull();
    expect(data).toEqual([
      {
        log_category: "payment",
        action: "payment.status_update",
        actor_type: "user",
        user_id: organizer.id,
        resource_type: "payment",
        outcome: "success",
        metadata: expect.objectContaining({
          old_status: "pending",
          new_status: "received",
          new_version: cashPayment.version + 1,
        }),
      },
    ]);
  });

  test("更新が拒否されたときはログを残さない", async ({
    adminClient,
    organizer,
    organizerClient,
    payment,
  }) => {
    const waived = await payment.createPaymentWithAttendance({
      method: "cash",
      status: "waived",
    });

    const { error } = await organizerClient.rpc("rpc_update_payment_status_safe", {
      p_payment_id: waived.id,
      p_new_status: "received",
      p_expected_version: waived.version,
      p_user_id: organizer.id,
    });

    expect(error?.code).toBe("P0001");

    const { count, error: countError } = await adminClient
      .from("system_logs")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", waived.id);

    expect(countError).toBeNull();
    expect(count).toBe(0);
  });
});
