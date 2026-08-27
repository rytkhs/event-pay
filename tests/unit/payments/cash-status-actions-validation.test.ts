import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerActionSupabaseClient: vi.fn(),
}));

vi.mock("@core/supabase/factory", () => mocks);

import { bulkUpdateCashStatusAction, updateCashStatusAction } from "@features/payments/server";

describe("現金決済更新Actionの境界バリデーション", () => {
  beforeEach(() => {
    mocks.createServerActionSupabaseClient.mockReset();
  });

  test("単件version欠落時はSupabaseクライアントとRPCを呼ばない", async () => {
    const result = await updateCashStatusAction({
      paymentId: randomUUID(),
      status: "received",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });

  test("一括の不正version時はSupabaseクライアントとRPCを呼ばない", async () => {
    const result = await bulkUpdateCashStatusAction({
      payments: [{ paymentId: randomUUID(), expectedVersion: -1 }],
      status: "received",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
    }
    expect(mocks.createServerActionSupabaseClient).not.toHaveBeenCalled();
  });
});
