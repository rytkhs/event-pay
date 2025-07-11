import { validateField } from "@/lib/validation/client-validation";
import { createEventSchema } from "@/lib/validations/event";

describe("締切フィールドバリデーション", () => {
  const futureYear = new Date().getFullYear() + 1;
  const baseFormData = {
    title: "テストイベント",
    description: "テストイベントの説明",
    location: "テスト会場",
    date: `${futureYear}-12-31T23:59`,
    capacity: "100",
    registrationDeadline: "",
    paymentDeadline: "",
    paymentMethods: "stripe",
    fee: "1000",
  };

  describe("クライアントサイドバリデーション", () => {
    it("参加申込締切が開催日時より後の場合はエラーとなる", () => {
      const errors = validateField("registrationDeadline", `${futureYear + 1}-01-01T12:00`, baseFormData);
      expect(errors.registrationDeadline).toBe("参加申込締切は開催日時より前に設定してください");
    });

    it("参加申込締切が開催日時より前の場合は正常", () => {
      const errors = validateField("registrationDeadline", `${futureYear}-12-30T23:59`, baseFormData);
      expect(errors.registrationDeadline).toBeUndefined();
    });

    it("決済締切が開催日時より後の場合はエラーとなる", () => {
      const formData = { ...baseFormData, registrationDeadline: `${futureYear}-12-30T12:00` };
      const errors = validateField("paymentDeadline", `${futureYear + 1}-01-01T12:00`, formData);
      expect(errors.paymentDeadline).toBe("決済締切は開催日時より前に設定してください");
    });

    it("決済締切が参加申込締切より前の場合はエラーとなる", () => {
      const formData = { ...baseFormData, registrationDeadline: `${futureYear}-12-30T12:00` };
      const errors = validateField("paymentDeadline", `${futureYear}-12-29T12:00`, formData);
      expect(errors.paymentDeadline).toBe("決済締切は参加申込締切以降に設定してください");
    });

    it("決済締切が参加申込締切以降かつ開催日時より前の場合は正常", () => {
      const formData = { ...baseFormData, registrationDeadline: `${futureYear}-12-30T12:00` };
      const errors = validateField("paymentDeadline", `${futureYear}-12-30T18:00`, formData);
      expect(errors.paymentDeadline).toBeUndefined();
    });

    it("締切フィールドが空の場合は正常（任意フィールドのため）", () => {
      const errors1 = validateField("registrationDeadline", "", baseFormData);
      const errors2 = validateField("paymentDeadline", "", baseFormData);
      expect(errors1.registrationDeadline).toBeUndefined();
      expect(errors2.paymentDeadline).toBeUndefined();
    });
  });

  describe("サーバーサイドバリデーション", () => {
    it("参加申込締切が開催日時より後の場合はエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...baseFormData,
        registration_deadline: `${futureYear + 1}-01-01T12:00`,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("参加申込締切は開催日時より前に設定してください");
      }
    });

    it("決済締切が開催日時より後の場合はエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...baseFormData,
        payment_deadline: `${futureYear + 1}-01-01T12:00`,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("決済締切は開催日時より前に設定してください");
      }
    });

    it("決済締切が参加申込締切より前の場合はエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...baseFormData,
        registration_deadline: `${futureYear}-12-30T12:00`,
        payment_deadline: `${futureYear}-12-29T12:00`,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("決済締切は参加申込締切以降に設定してください");
      }
    });

    it("締切フィールドが正しく設定されている場合は正常", () => {
      const result = createEventSchema.safeParse({
        ...baseFormData,
        registration_deadline: `${futureYear}-12-30T12:00`,
        payment_deadline: `${futureYear}-12-30T18:00`,
      });
      expect(result.success).toBe(true);
    });

    it("締切フィールドが空の場合は正常（任意フィールドのため）", () => {
      const result = createEventSchema.safeParse({
        ...baseFormData,
        registration_deadline: undefined,
        payment_deadline: undefined,
      });
      expect(result.success).toBe(true);
    });

    it("過去の日時は現在時刻チェックでエラーとなる", () => {
      const result = createEventSchema.safeParse({
        ...baseFormData,
        registration_deadline: "2020-01-01T12:00",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("参加申込締切は現在時刻より後である必要があります");
      }
    });
  });
});