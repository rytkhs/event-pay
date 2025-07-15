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
    it("無料と有料決済方法の組み合わせはエラーとなる", () => {
      const errors = validateField("paymentMethods", "free,stripe", mockFormData);
      expect(errors.paymentMethods).toBe(
        "無料イベントと有料決済方法を同時に選択することはできません"
      );
    });

    it("無料と現金決済方法の組み合わせはエラーとなる", () => {
      const errors = validateField("paymentMethods", "free,cash", mockFormData);
      expect(errors.paymentMethods).toBe(
        "無料イベントと有料決済方法を同時に選択することはできません"
      );
    });

    it("無料とStripe・現金決済方法の組み合わせはエラーとなる", () => {
      const errors = validateField("paymentMethods", "free,stripe,cash", mockFormData);
      expect(errors.paymentMethods).toBe(
        "無料イベントと有料決済方法を同時に選択することはできません"
      );
    });

    it("無料のみの場合は正常", () => {
      const errors = validateField("paymentMethods", "free", mockFormData);
      expect(errors.paymentMethods).toBeUndefined();
    });

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
  });

  describe("サーバーサイドバリデーション", () => {
    it("無料と有料決済方法の組み合わせはエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "free,stripe",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          "無料イベントと有料決済方法を同時に選択することはできません"
        );
      }
    });

    it("無料のみの場合は正常", () => {
      const result = createEventSchema.safeParse({
        ...mockFormData,
        payment_methods: "free",
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
  });
});
