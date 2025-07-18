import { validateField } from "@/lib/validation/client-validation";
import { createEventSchema } from "@/lib/validations/event";

describe("決済方法バリデーション", () => {
  const mockFormData = {
    title: "テストイベント",
    description: "テストイベントの説明",
    location: "テスト会場",
    date: "2025-12-31T23:59",
    capacity: "100",
    registrationDeadline: "2025-12-30T23:59",
    paymentDeadline: "2025-12-31T12:00",
    paymentMethods: "",
    fee: "1000",
  };

  describe("クライアントサイドバリデーション", () => {
    it("Stripeのみの場合は正常", () => {
      const errors = validateField("paymentMethods", "stripe", mockFormData);
      expect(errors.paymentMethods).toBeUndefined();
    });

    it("現金のみの場合は正常", () => {
      const errors = validateField("paymentMethods", "cash", mockFormData);
      expect(errors.paymentMethods).toBeUndefined();
    });

    it("Stripeと現金の組み合わせは正常", () => {
      const errors = validateField("paymentMethods", "stripe,cash", mockFormData);
      expect(errors.paymentMethods).toBeUndefined();
    });

    it("無効な決済方法はエラーとなる", () => {
      const errors = validateField("paymentMethods", "invalid", mockFormData);
      expect(errors.paymentMethods).toBe("有効な決済方法を選択してください");
    });

    it("freeは無効な決済方法としてエラーとなる", () => {
      const errors = validateField("paymentMethods", "free", mockFormData);
      expect(errors.paymentMethods).toBe("有効な決済方法を選択してください");
    });
  });

  describe("サーバーサイドバリデーション", () => {
    it("参加費0円の場合は無料イベントとして扱われる", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        fee: "0",
        payment_methods: "stripe,cash",
      });
      expect(result.success).toBe(true);
    });

    it("Stripeのみの場合は正常", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "stripe",
      });
      expect(result.success).toBe(true);
    });

    it("現金のみの場合は正常", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "cash",
      });
      expect(result.success).toBe(true);
    });

    it("Stripeと現金の組み合わせは正常", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "stripe,cash",
      });
      expect(result.success).toBe(true);
    });

    it("無効な決済方法はエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "invalid",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("有効な決済方法を選択してください");
      }
    });

    it("freeは無効な決済方法としてエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "free",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("有効な決済方法を選択してください");
      }
    });
  });
});
