/**
 * status_rank関数の単体テスト
 *
 * 仕様書: docs/spec/add-canceled-status/design-v2.md
 *
 * 目的:
 * - status_rank関数がcanceledステータスを含む全てのステータスで正しいランク値を返すことを検証
 * - canPromoteStatus関数が昇格/降格ルールに従って正しく動作することを検証
 */

import { statusRank, canPromoteStatus } from "../../../../core/utils/payments/status-rank";
import type { Database } from "../../../../types/database";

type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

describe("status_rank関数", () => {
  describe("ステータスランク値", () => {
    test("pending は rank 10 を返す", () => {
      expect(statusRank("pending")).toBe(10);
    });

    test("failed は rank 15 を返す", () => {
      expect(statusRank("failed")).toBe(15);
    });

    test("paid は rank 20 を返す", () => {
      expect(statusRank("paid")).toBe(20);
    });

    test("received は rank 20 を返す（paid と同じ）", () => {
      expect(statusRank("received")).toBe(20);
    });

    test("waived は rank 25 を返す", () => {
      expect(statusRank("waived")).toBe(25);
    });

    test("canceled は rank 35 を返す", () => {
      expect(statusRank("canceled")).toBe(35);
    });

    test("refunded は rank 40 を返す", () => {
      expect(statusRank("refunded")).toBe(40);
    });

    test("未知のステータスは rank 0 を返す", () => {
      expect(statusRank("unknown" as PaymentStatus)).toBe(0);
    });
  });

  describe("ランク順序の検証", () => {
    test("ランクの昇順: pending < failed < paid/received < waived < canceled < refunded", () => {
      expect(statusRank("pending")).toBeLessThan(statusRank("failed"));
      expect(statusRank("failed")).toBeLessThan(statusRank("paid"));
      expect(statusRank("failed")).toBeLessThan(statusRank("received"));
      expect(statusRank("paid")).toBeLessThan(statusRank("waived"));
      expect(statusRank("received")).toBeLessThan(statusRank("waived"));
      expect(statusRank("waived")).toBeLessThan(statusRank("canceled"));
      expect(statusRank("canceled")).toBeLessThan(statusRank("refunded"));
    });

    test("paid と received は同じランク", () => {
      expect(statusRank("paid")).toBe(statusRank("received"));
    });
  });

  describe("設計書との整合性", () => {
    const SPEC_STATUS_RANKS = {
      pending: 10,
      failed: 15,
      paid: 20,
      received: 20,
      waived: 25,
      canceled: 35,
      refunded: 40,
    } as const;

    test.each(Object.entries(SPEC_STATUS_RANKS))(
      "%s のランクが設計書通り %d である",
      (status, expectedRank) => {
        expect(statusRank(status as PaymentStatus)).toBe(expectedRank);
      }
    );
  });
});

describe("canPromoteStatus関数", () => {
  describe("昇格（許可される遷移）", () => {
    test("pending → failed への昇格を許可", () => {
      expect(canPromoteStatus("pending", "failed")).toBe(true);
    });

    test("pending → paid への昇格を許可", () => {
      expect(canPromoteStatus("pending", "paid")).toBe(true);
    });

    test("pending → received への昇格を許可", () => {
      expect(canPromoteStatus("pending", "received")).toBe(true);
    });

    test("pending → waived への昇格を許可", () => {
      expect(canPromoteStatus("pending", "waived")).toBe(true);
    });

    test("pending → canceled への昇格を許可", () => {
      expect(canPromoteStatus("pending", "canceled")).toBe(true);
    });

    test("failed → paid への昇格を許可", () => {
      expect(canPromoteStatus("failed", "paid")).toBe(true);
    });

    test("failed → received への昇格を許可", () => {
      expect(canPromoteStatus("failed", "received")).toBe(true);
    });

    test("failed → canceled への昇格を許可", () => {
      expect(canPromoteStatus("failed", "canceled")).toBe(true);
    });

    test("paid → refunded への昇格を許可", () => {
      expect(canPromoteStatus("paid", "refunded")).toBe(true);
    });

    test("received → refunded への昇格を許可", () => {
      expect(canPromoteStatus("received", "refunded")).toBe(true);
    });

    test("waived → refunded への昇格を許可", () => {
      expect(canPromoteStatus("waived", "refunded")).toBe(true);
    });
  });

  describe("同じランク間の遷移", () => {
    test("paid → received への遷移を許可（同ランク）", () => {
      expect(canPromoteStatus("paid", "received")).toBe(true);
    });

    test("received → paid への遷移を許可（同ランク）", () => {
      expect(canPromoteStatus("received", "paid")).toBe(true);
    });
  });

  describe("降格（拒否される遷移）", () => {
    test("paid → pending への降格を拒否", () => {
      expect(canPromoteStatus("paid", "pending")).toBe(false);
    });

    test("paid → failed への降格を拒否", () => {
      expect(canPromoteStatus("paid", "failed")).toBe(false);
    });

    test("received → pending への降格を拒否", () => {
      expect(canPromoteStatus("received", "pending")).toBe(false);
    });

    test("received → failed への降格を拒否", () => {
      expect(canPromoteStatus("received", "failed")).toBe(false);
    });

    test("waived → pending への降格を拒否", () => {
      expect(canPromoteStatus("waived", "pending")).toBe(false);
    });

    test("waived → paid への降格を拒否", () => {
      expect(canPromoteStatus("waived", "paid")).toBe(false);
    });

    test("canceled → pending への降格を拒否", () => {
      expect(canPromoteStatus("canceled", "pending")).toBe(false);
    });

    test("canceled → failed への降格を拒否", () => {
      expect(canPromoteStatus("canceled", "failed")).toBe(false);
    });

    test("canceled → paid への降格を拒否", () => {
      expect(canPromoteStatus("canceled", "paid")).toBe(false);
    });

    test("canceled → received への降格を拒否", () => {
      expect(canPromoteStatus("canceled", "received")).toBe(false);
    });

    test("canceled → waived への降格を拒否", () => {
      expect(canPromoteStatus("canceled", "waived")).toBe(false);
    });

    test("refunded → pending への降格を拒否", () => {
      expect(canPromoteStatus("refunded", "pending")).toBe(false);
    });

    test("refunded → paid への降格を拒否", () => {
      expect(canPromoteStatus("refunded", "paid")).toBe(false);
    });

    test("refunded → canceled への降格を拒否", () => {
      expect(canPromoteStatus("refunded", "canceled")).toBe(false);
    });
  });

  describe("同じステータスへの遷移", () => {
    test("pending → pending は許可（冪等性）", () => {
      expect(canPromoteStatus("pending", "pending")).toBe(true);
    });

    test("paid → paid は許可（冪等性）", () => {
      expect(canPromoteStatus("paid", "paid")).toBe(true);
    });

    test("canceled → canceled は許可（冪等性）", () => {
      expect(canPromoteStatus("canceled", "canceled")).toBe(true);
    });
  });

  describe("canceled に関する特殊な遷移", () => {
    test("canceled → refunded への遷移を拒否（canceledは未決済系の終端）", () => {
      expect(canPromoteStatus("canceled", "refunded")).toBe(false);
    });

    test("paid → canceled への遷移を拒否（決済完了後はcanceledに遷移しない）", () => {
      expect(canPromoteStatus("paid", "canceled")).toBe(false);
    });

    test("received → canceled への遷移を拒否（決済完了後はcanceledに遷移しない）", () => {
      expect(canPromoteStatus("received", "canceled")).toBe(false);
    });

    test("waived → canceled への遷移を拒否（免除後はcanceledに遷移しない）", () => {
      expect(canPromoteStatus("waived", "canceled")).toBe(false);
    });
  });
});
