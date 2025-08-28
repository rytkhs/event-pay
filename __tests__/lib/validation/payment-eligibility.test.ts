/**
 * 決済許可条件テスト
 * 共通関数の動作確認とUI/API間の整合性検証
 */

import {
  canGuestRepay,
  canCreateStripeSession,
  checkBasicPaymentEligibility,
  isBeforePaymentDeadline,
  type PaymentEligibilityEvent,
  type PaymentEligibilityAttendance,
} from "@/lib/validation/payment-eligibility";

describe("決済許可条件テスト", () => {
  const baseEvent: PaymentEligibilityEvent = {
    id: "event-1",
    status: "upcoming",
    fee: 1000,
    date: "2025-12-31T15:00:00.000Z", // 2025年12月31日 24:00 JST (未来の日付)
    payment_deadline: null,
  };

  const baseAttendance: PaymentEligibilityAttendance = {
    id: "attendance-1",
    status: "attending",
    payment: {
      method: "stripe",
      status: "pending",
    },
  };

  describe("基本的な決済許可条件", () => {
    it("正常な条件の場合は許可される", () => {
      const result = checkBasicPaymentEligibility(baseAttendance, baseEvent);

      expect(result.isEligible).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.checks.isAttending).toBe(true);
      expect(result.checks.isPaidEvent).toBe(true);
      expect(result.checks.isUpcomingEvent).toBe(true);
      expect(result.checks.isBeforeDeadline).toBe(true);
    });

    it("不参加の場合は拒否される", () => {
      const attendance = { ...baseAttendance, status: "not_attending" as const };
      const result = checkBasicPaymentEligibility(attendance, baseEvent);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("参加者のみ決済を行えます。");
    });

    it("無料イベントの場合は拒否される", () => {
      const event = { ...baseEvent, fee: 0 };
      const result = checkBasicPaymentEligibility(baseAttendance, event);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("無料イベントでは決済は不要です。");
    });

    it("キャンセル済みイベントの場合は拒否される", () => {
      const event = { ...baseEvent, status: "cancelled" as const };
      const result = checkBasicPaymentEligibility(baseAttendance, event);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("キャンセル済みまたは無効な状態のイベントです。");
    });

    it("決済期限を過ぎている場合は拒否される", () => {
      const pastTime = new Date("2025-01-01T00:00:00.000Z");
      const currentTime = new Date("2025-12-31T15:00:00.000Z");
      const event = { ...baseEvent, payment_deadline: pastTime.toISOString() };

      const result = checkBasicPaymentEligibility(baseAttendance, event, currentTime);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("決済期限を過ぎています。");
    });
  });

  describe("ゲスト再決済ボタン表示判定", () => {
    it("失敗ステータスの場合は再決済可能", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "stripe", status: "failed" as const },
      };

      const result = canGuestRepay(attendance, baseEvent);

      expect(result.isEligible).toBe(true);
    });

    it("保留ステータスの場合は再決済可能", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "stripe", status: "pending" as const },
      };

      const result = canGuestRepay(attendance, baseEvent);

      expect(result.isEligible).toBe(true);
    });

    it("決済済みの場合は再決済不可", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "stripe", status: "paid" as const },
      };

      const result = canGuestRepay(attendance, baseEvent);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("決済ステータスがfailedまたはpendingである必要があります。");
    });

    it("現金決済の場合は再決済不可", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "cash", status: "failed" as const },
      };

      const result = canGuestRepay(attendance, baseEvent);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("決済方法がstripeである必要があります。");
    });
  });

  describe("Stripe決済セッション作成判定", () => {
    it("未決済の場合は作成可能", () => {
      const attendance = { ...baseAttendance, payment: null };

      const result = canCreateStripeSession(attendance, baseEvent);

      expect(result.isEligible).toBe(true);
    });

    it("失敗ステータスの場合は作成可能", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "stripe", status: "failed" as const },
      };

      const result = canCreateStripeSession(attendance, baseEvent);

      expect(result.isEligible).toBe(true);
    });

    it("決済済みの場合は作成不可", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "stripe", status: "paid" as const },
      };

      const result = canCreateStripeSession(attendance, baseEvent);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("すでに決済は完了（または返金済み）しています。");
    });

    it("現金決済済みの場合は作成不可", () => {
      const attendance = {
        ...baseAttendance,
        payment: { method: "cash", status: "received" as const },
      };

      const result = canCreateStripeSession(attendance, baseEvent);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe("この参加者の支払方法はオンライン決済ではありません。");
    });
  });

  describe("決済期限チェック", () => {
    it("payment_deadlineが設定されている場合はそれを優先", () => {
      const event = {
        ...baseEvent,
        date: "2025-12-31T15:00:00.000Z",
        payment_deadline: "2025-12-30T15:00:00.000Z",
      };
      const currentTime = new Date("2025-12-29T15:00:00.000Z");

      const result = isBeforePaymentDeadline(event, currentTime);

      expect(result).toBe(true);
    });

    it("payment_deadlineが未設定の場合はevent.dateを使用", () => {
      const event = {
        ...baseEvent,
        date: "2025-12-31T15:00:00.000Z",
        payment_deadline: null,
      };
      const currentTime = new Date("2025-12-30T15:00:00.000Z");

      const result = isBeforePaymentDeadline(event, currentTime);

      expect(result).toBe(true);
    });

    it("期限を過ぎている場合はfalse", () => {
      const event = {
        ...baseEvent,
        date: "2025-12-31T15:00:00.000Z",
        payment_deadline: "2025-12-30T15:00:00.000Z",
      };
      const currentTime = new Date("2025-12-31T15:00:00.000Z");

      const result = isBeforePaymentDeadline(event, currentTime);

      expect(result).toBe(false);
    });
  });

  describe("UI/API間の整合性検証", () => {
    it("ゲスト再決済判定とStripeセッション作成判定の関係性", () => {
      // 再決済可能なケース = Stripeセッションも作成可能であるべき
      const attendance = {
        ...baseAttendance,
        payment: { method: "stripe", status: "failed" as const },
      };

      const repayResult = canGuestRepay(attendance, baseEvent);
      const sessionResult = canCreateStripeSession(attendance, baseEvent);

      expect(repayResult.isEligible).toBe(true);
      expect(sessionResult.isEligible).toBe(true);
    });

    it("再決済不可なケースでもStripeセッション作成は可能な場合がある", () => {
      // 未決済の場合: 再決済ボタンは出ないが、Stripeセッションは作成可能
      const attendance = { ...baseAttendance, payment: null };

      const repayResult = canGuestRepay(attendance, baseEvent);
      const sessionResult = canCreateStripeSession(attendance, baseEvent);

      expect(repayResult.isEligible).toBe(false); // 決済方法がstripeである必要がある
      expect(sessionResult.isEligible).toBe(true); // 未決済なので作成可能
    });
  });
});
