import { describe, expect } from "vitest";

import { PAYMENT_STATUS_VALUES } from "@core/constants/statuses";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

import { test } from "../../fixtures/test";

/**
 * CSH-03: 決済ステータスの遷移表は DB と TS で一致する。
 *
 * 遷移表の正本は DB `public.can_promote_payment_status()`、
 * `canPromoteStatus()` はそのミラー。片方だけを書き換えると
 * DB が最終防衛線として機能しなくなるため、全組み合わせで突き合わせる。
 */

const COMBINATIONS = PAYMENT_STATUS_VALUES.flatMap((from) =>
  PAYMENT_STATUS_VALUES.map((to) => ({ from, to }))
);

describe("DBとTSの遷移表", () => {
  describe.each(COMBINATIONS)("$fromから$to", ({ from, to }) => {
    test("への遷移可否が一致する", async ({ adminClient }) => {
      const { data, error } = await adminClient.rpc("can_promote_payment_status", {
        p_old: from,
        p_new: to,
      });

      expect(error).toBeNull();
      expect(data).toBe(canPromoteStatus(from, to));
    });
  });
});
