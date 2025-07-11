import { validateField, validateAllFields } from "@/lib/validation/client-validation";

describe("client-validation", () => {
  const mockFormData = {
    title: "テストイベント",
    description: "テストイベントの説明",
    location: "テスト会場",
    date: "2025-12-31T23:59",
    capacity: "100",
    registrationDeadline: "2025-12-30T23:59",
    paymentDeadline: "2025-12-31T12:00",
    paymentMethods: "stripe",
    fee: "1000",
  };

  describe("validateField - capacity", () => {
    it("定員が1以上10000以下の場合は正常", () => {
      const errors = validateField("capacity", "100", mockFormData);
      expect(errors.capacity).toBeUndefined();
    });

    it("定員が0の場合はエラーとなる", () => {
      const errors = validateField("capacity", "0", mockFormData);
      expect(errors.capacity).toBe("定員は1以上10000以下である必要があります");
    });

    it("定員が負の数の場合はエラーとなる", () => {
      const errors = validateField("capacity", "-1", mockFormData);
      expect(errors.capacity).toBe("定員は1以上10000以下である必要があります");
    });

    it("定員が10000を超える場合はエラーとなる", () => {
      const errors = validateField("capacity", "10001", mockFormData);
      expect(errors.capacity).toBe("定員は1以上10000以下である必要があります");
    });

    it("定員が数値以外の場合はエラーとなる", () => {
      const errors = validateField("capacity", "abc", mockFormData);
      expect(errors.capacity).toBe("定員は1以上10000以下である必要があります");
    });

    it("定員が空文字の場合は正常（任意フィールド）", () => {
      const errors = validateField("capacity", "", mockFormData);
      expect(errors.capacity).toBeUndefined();
    });
  });

  describe("validateField - fee", () => {
    it("参加費が数値で0以上の場合は正常", () => {
      const errors = validateField("fee", "1000", mockFormData);
      expect(errors.fee).toBeUndefined();
    });

    it("参加費が0の場合は正常", () => {
      const errors = validateField("fee", "0", mockFormData);
      expect(errors.fee).toBeUndefined();
    });

    it("参加費が負の数の場合はエラーとなる", () => {
      const errors = validateField("fee", "-1", mockFormData);
      expect(errors.fee).toBe("参加費は0以上1000000以下である必要があります");
    });

    it("参加費が1000000を超える場合はエラーとなる", () => {
      const errors = validateField("fee", "1000001", mockFormData);
      expect(errors.fee).toBe("参加費は0以上1000000以下である必要があります");
    });

    it("参加費が数値以外の場合はエラーとなる", () => {
      const errors = validateField("fee", "abc", mockFormData);
      expect(errors.fee).toBe("参加費は0以上1000000以下である必要があります");
    });

    it("参加費が空文字の場合はエラーとなる", () => {
      const errors = validateField("fee", "", mockFormData);
      expect(errors.fee).toBe("参加費は必須です");
    });
  });

  describe("validateField - fee with free payment", () => {
    const freeEventFormData = {
      ...mockFormData,
      paymentMethods: "free",
    };

    it("無料イベントで参加費が0の場合は正常", () => {
      const errors = validateField("fee", "0", freeEventFormData);
      expect(errors.fee).toBeUndefined();
    });

    it("無料イベントで参加費が空文字の場合は正常", () => {
      const errors = validateField("fee", "", freeEventFormData);
      expect(errors.fee).toBeUndefined();
    });

    it("無料イベントで参加費が0以外の場合はエラーとなる", () => {
      const errors = validateField("fee", "1000", freeEventFormData);
      expect(errors.fee).toBe("無料イベントの参加費は0円である必要があります");
    });
  });

  describe("validateField - fee with payment methods not set", () => {
    const noPaymentMethodFormData = {
      ...mockFormData,
      paymentMethods: "",
    };

    it("決済方法が未選択で参加費が空文字の場合はエラーとなる", () => {
      const errors = validateField("fee", "", noPaymentMethodFormData);
      expect(errors.fee).toBe("参加費は必須です");
    });

    it("決済方法が未選択で参加費が設定されている場合は正常", () => {
      const errors = validateField("fee", "1000", noPaymentMethodFormData);
      expect(errors.fee).toBeUndefined();
    });
  });
});