import {
  calculateEffectiveTime,
  findLatestPaymentByEffectiveTime,
} from "../../../features/payments/services/utils/payment-effective-time";

const TERMINAL_STATUSES = ["paid", "received", "refunded", "waived"] as const;

describe("payment-effective-time utils", () => {
  describe("calculateEffectiveTime", () => {
    it("terminal statusは paid_at > updated_at > created_at を返す", () => {
      const createdAt = "2025-01-01T00:00:00.000Z";
      const updatedAt = "2025-01-02T00:00:00.000Z";
      const paidAt = "2025-01-03T00:00:00.000Z";

      expect(calculateEffectiveTime("paid", paidAt, updatedAt, createdAt, TERMINAL_STATUSES)).toBe(
        paidAt
      );
      expect(calculateEffectiveTime("paid", null, updatedAt, createdAt, TERMINAL_STATUSES)).toBe(
        updatedAt
      );
      expect(calculateEffectiveTime("paid", null, null, createdAt, TERMINAL_STATUSES)).toBe(
        createdAt
      );
    });

    it("open statusは updated_at > created_at を返す", () => {
      const createdAt = "2025-01-01T00:00:00.000Z";
      const updatedAt = "2025-01-02T00:00:00.000Z";

      expect(calculateEffectiveTime("pending", null, updatedAt, createdAt, TERMINAL_STATUSES)).toBe(
        updatedAt
      );
      expect(calculateEffectiveTime("failed", null, null, createdAt, TERMINAL_STATUSES)).toBe(
        createdAt
      );
    });
  });

  describe("findLatestPaymentByEffectiveTime", () => {
    it("effectiveTimeが最も新しい決済を返す", () => {
      const payments = [
        {
          id: "p1",
          status: "pending",
          paid_at: null,
          updated_at: "2025-01-01T00:00:00.000Z",
          created_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "p2",
          status: "paid",
          paid_at: "2025-01-03T00:00:00.000Z",
          updated_at: "2025-01-02T00:00:00.000Z",
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ];

      const latest = findLatestPaymentByEffectiveTime(payments, TERMINAL_STATUSES);
      expect(latest?.id).toBe("p2");
    });

    it("effectiveTimeが同じ場合は created_at が新しい方を返す", () => {
      const payments = [
        {
          id: "p1",
          status: "pending",
          paid_at: null,
          updated_at: "2025-01-02T00:00:00.000Z",
          created_at: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "p2",
          status: "pending",
          paid_at: null,
          updated_at: "2025-01-02T00:00:00.000Z",
          created_at: "2025-01-03T00:00:00.000Z",
        },
      ];

      const latest = findLatestPaymentByEffectiveTime(payments, TERMINAL_STATUSES);
      expect(latest?.id).toBe("p2");
    });

    it("有効時間がnullのみの場合はnullを返す", () => {
      const payments = [
        {
          id: "p1",
          status: "pending",
          paid_at: null,
          updated_at: null,
          created_at: null,
        },
      ];

      const latest = findLatestPaymentByEffectiveTime(payments, TERMINAL_STATUSES);
      expect(latest).toBeNull();
    });
  });
});
