import { describe, expect, it } from "vitest";

import type { PaymentStatus } from "@core/types/statuses";
import { canPromoteStatus } from "@core/utils/payments/status-rank";

/**
 * PAY-06: Payment状態は遅延イベントで降格しない。
 *
 * rank の数値そのものは内部表現のため assert しない。
 * 外部から観測できる契約は「遷移を許すかどうか」だけ。
 */
describe("canPromoteStatus", () => {
  it.each<[PaymentStatus, PaymentStatus]>([
    ["pending", "paid"],
    ["pending", "received"],
    ["paid", "waived"],
  ])("未確定の %s は %s へ昇格できる", (current, target) => {
    expect(canPromoteStatus(current, target)).toBe(true);
  });

  it.each<PaymentStatus>(["pending", "paid", "refunded", "canceled"])(
    "同一状態 %s への遷移は冪等に許可される",
    (status) => {
      expect(canPromoteStatus(status, status)).toBe(true);
    }
  );

  it.each<[PaymentStatus, PaymentStatus]>([
    ["paid", "pending"],
    ["received", "failed"],
    ["refunded", "paid"],
  ])("遅れて届いた %s イベントは %s へ降格させない", (current, target) => {
    expect(canPromoteStatus(current, target)).toBe(false);
  });

  describe("canceled", () => {
    it.each<PaymentStatus>(["pending", "failed"])(
      "未集金の %s からは canceled にできる",
      (current) => {
        expect(canPromoteStatus(current, "canceled")).toBe(true);
      }
    );

    it.each<PaymentStatus>(["paid", "received", "waived"])(
      "集金済みの %s からは canceled にできない",
      (current) => {
        expect(canPromoteStatus(current, "canceled")).toBe(false);
      }
    );

    it.each<PaymentStatus>(["paid", "refunded", "pending"])(
      "終端状態 canceled からは %s へ遷移できない",
      (target) => {
        expect(canPromoteStatus("canceled", target)).toBe(false);
      }
    );
  });

  describe("refunded", () => {
    it.each<PaymentStatus>(["paid", "received", "waived"])(
      "決済完了した %s からは refunded にできる",
      (current) => {
        expect(canPromoteStatus(current, "refunded")).toBe(true);
      }
    );

    it.each<PaymentStatus>(["pending", "failed"])(
      "未決済の %s からは refunded にできない",
      (current) => {
        expect(canPromoteStatus(current, "refunded")).toBe(false);
      }
    );
  });
});
