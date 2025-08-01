import {
  participationFormSchema,
  validateParticipationField,
  validateParticipationForm,
  type ParticipationFormData,
} from "@/lib/validations/participation";

describe("決済方法選択のバリデーション", () => {
  const baseFormData: ParticipationFormData = {
    inviteToken: "abcdefghijklmnopqrstuvwxyz123456", // 32文字の有効なトークン
    nickname: "テストユーザー",
    email: "test@example.com",
    attendanceStatus: "attending",
    paymentMethod: undefined,
  };

  describe("participationFormSchema", () => {
    it("参加ステータスが'attending'の場合、決済方法が必須", () => {
      const result = participationFormSchema.safeParse(baseFormData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ["paymentMethod"],
              message: "参加を選択した場合は決済方法を選択してください",
            }),
          ])
        );
      }
    });

    it("参加ステータスが'attending'で決済方法が'stripe'の場合、バリデーション成功", () => {
      const formData = {
        ...baseFormData,
        paymentMethod: "stripe" as const,
      };

      const result = participationFormSchema.safeParse(formData);
      expect(result.success).toBe(true);
    });

    it("参加ステータスが'attending'で決済方法が'cash'の場合、バリデーション成功", () => {
      const formData = {
        ...baseFormData,
        paymentMethod: "cash" as const,
      };

      const result = participationFormSchema.safeParse(formData);
      expect(result.success).toBe(true);
    });

    it("参加ステータスが'not_attending'の場合、決済方法は不要", () => {
      const formData = {
        ...baseFormData,
        attendanceStatus: "not_attending" as const,
        paymentMethod: undefined,
      };

      const result = participationFormSchema.safeParse(formData);
      expect(result.success).toBe(true);
    });

    it("参加ステータスが'maybe'の場合、決済方法は不要", () => {
      const formData = {
        ...baseFormData,
        attendanceStatus: "maybe" as const,
        paymentMethod: undefined,
      };

      const result = participationFormSchema.safeParse(formData);
      expect(result.success).toBe(true);
    });

    it("無効な決済方法の場合、バリデーションエラー", () => {
      const formData = {
        ...baseFormData,
        paymentMethod: "invalid" as any,
      };

      const result = participationFormSchema.safeParse(formData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ["paymentMethod"],
              message: "有効な決済方法を選択してください",
            }),
          ])
        );
      }
    });
  });

  describe("validateParticipationField", () => {
    it("決済方法フィールドの個別バリデーション - 有効な値", () => {
      const errors = validateParticipationField("paymentMethod", "stripe", baseFormData);
      expect(errors.paymentMethod).toBeUndefined();
    });

    it("決済方法フィールドの個別バリデーション - 無効な値", () => {
      const errors = validateParticipationField("paymentMethod", "invalid", baseFormData);
      expect(errors.paymentMethod).toBe("有効な決済方法を選択してください");
    });

    it("参加ステータス変更時の決済方法要否チェック", () => {
      const formDataWithoutPayment = {
        ...baseFormData,
        paymentMethod: undefined,
      };

      const errors = validateParticipationField(
        "attendanceStatus",
        "attending",
        formDataWithoutPayment
      );
      expect(errors.paymentMethod).toBe("参加を選択した場合は決済方法を選択してください");
    });
  });

  describe("validateParticipationForm", () => {
    it("完全なフォームデータのバリデーション - 成功", () => {
      const formData = {
        ...baseFormData,
        paymentMethod: "stripe" as const,
      };

      const errors = validateParticipationForm(formData);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it("完全なフォームデータのバリデーション - 決済方法不足", () => {
      const errors = validateParticipationForm(baseFormData);
      expect(errors.paymentMethod).toBe("参加を選択した場合は決済方法を選択してください");
    });
  });
});
