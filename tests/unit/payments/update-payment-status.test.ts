import { describe, expect, it, vi } from "vitest";

import { PaymentErrorType, type PaymentError } from "@core/types/payment-errors";
import type { AppSupabaseClient } from "@core/types/supabase";

import { updatePaymentStatusSafe } from "../../../features/payments/services/status-update/update-payment-status";

function createSupabaseWithRpcError(code: string): AppSupabaseClient<"public"> {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { code, message: "RPC failed" },
    }),
  } as unknown as AppSupabaseClient<"public">;
}

const PARAMS = {
  paymentId: "00000000-0000-4000-8000-000000000001",
  status: "received" as const,
  expectedVersion: 1,
  userId: "00000000-0000-4000-8000-000000000002",
};

describe("updatePaymentStatusSafe", () => {
  it("PT409をCONCURRENT_UPDATEへ変換する", async () => {
    const promise = updatePaymentStatusSafe(PARAMS, createSupabaseWithRpcError("PT409"));

    await expect(promise).rejects.toMatchObject({
      type: PaymentErrorType.CONCURRENT_UPDATE,
    } satisfies Partial<PaymentError>);
  });

  it("競合以外の未知なRPCエラーをDATABASE_ERRORへ変換する", async () => {
    const promise = updatePaymentStatusSafe(PARAMS, createSupabaseWithRpcError("XX000"));

    await expect(promise).rejects.toMatchObject({
      type: PaymentErrorType.DATABASE_ERROR,
    } satisfies Partial<PaymentError>);
  });
});
