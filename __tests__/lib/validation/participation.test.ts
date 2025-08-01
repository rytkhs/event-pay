import {
  participationFormSchema,
  validateParticipationField,
  validateParticipationForm,
  validateParticipationFormWithDuplicateCheck,
  sanitizeParticipationInput,
  inviteTokenSchema,
  nicknameSchema,
  emailSchema,
  attendanceStatusSchema,
  paymentMethodSchema,
  type ParticipationFormData,
} from "@/lib/validations/participation";
import { checkDuplicateEmail } from "@/lib/utils/invite-token";

// モック設定
jest.mock("@/lib/utils/invite-token", () => ({
  checkDuplicateEmail: jest.fn(),
}));

const mockCheckDuplicateEmail = checkDuplicateEmail as jest.MockedFunction<
  typeof checkDuplicateEmail
>;

describe("Participation Form Validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Individual Schema Validation", () => {
    describe("inviteTokenSchema", () => {
      it("有効な招待トークンを受け入れる", () => {
        const validToken = "abcdefghijklmnopqrstuvwxyz123456";
        expect(() => inviteTokenSchema.parse(validToken)).not.toThrow();
      });

      it("無効な長さの招待トークンを拒否する", () => {
        expect(() => inviteTokenSchema.parse("short")).toThrow("無効な招待トークンの形式です");
        expect(() =>
          inviteTokenSchema.parse("toolongtoken123456789012345678901234567890")
        ).toThrow();
      });

      it("無効な文字を含む招待トークンを拒否する", () => {
        expect(() => inviteTokenSchema.parse("invalid@token#with$special%chars")).toThrow(
          "無効な招待トークンの文字です"
        );
      });
    });

    describe("nicknameSchema", () => {
      it("有効なニックネームを受け入れる", () => {
        const result = nicknameSchema.parse("テストユーザー");
        expect(result).toBe("テストユーザー");
      });

      it("空のニックネームを拒否する", () => {
        expect(() => nicknameSchema.parse("")).toThrow("ニックネームを入力してください");
        expect(() => nicknameSchema.parse("   ")).toThrow("ニックネームを入力してください");
      });

      it("長すぎるニックネームを拒否する", () => {
        const longNickname = "a".repeat(51);
        expect(() => nicknameSchema.parse(longNickname)).toThrow(
          "ニックネームは50文字以内で入力してください"
        );
      });

      it("前後の空白を除去する", () => {
        const result = nicknameSchema.parse("  テストユーザー  ");
        expect(result).toBe("テストユーザー");
      });
    });

    describe("emailSchema", () => {
      it("有効なメールアドレスを受け入れる", () => {
        const result = emailSchema.parse("test@example.com");
        expect(result).toBe("test@example.com");
      });

      it("無効なメールアドレスを拒否する", () => {
        expect(() => emailSchema.parse("invalid-email")).toThrow(
          "有効なメールアドレスを入力してください"
        );
        expect(() => emailSchema.parse("@example.com")).toThrow();
        expect(() => emailSchema.parse("test@")).toThrow();
      });

      it("長すぎるメールアドレスを拒否する", () => {
        const longEmail = "a".repeat(250) + "@example.com";
        expect(() => emailSchema.parse(longEmail)).toThrow(
          "メールアドレスは255文字以内で入力してください"
        );
      });

      it("メールアドレスを小文字に変換する", () => {
        const result = emailSchema.parse("  TEST@EXAMPLE.COM  ");
        expect(result).toBe("test@example.com");
      });
    });

    describe("attendanceStatusSchema", () => {
      it("有効な参加ステータスを受け入れる", () => {
        expect(() => attendanceStatusSchema.parse("attending")).not.toThrow();
        expect(() => attendanceStatusSchema.parse("not_attending")).not.toThrow();
        expect(() => attendanceStatusSchema.parse("maybe")).not.toThrow();
      });

      it("無効な参加ステータスを拒否する", () => {
        expect(() => attendanceStatusSchema.parse("invalid")).toThrow(
          "有効な参加ステータスを選択してください"
        );
      });
    });

    describe("paymentMethodSchema", () => {
      it("有効な決済方法を受け入れる", () => {
        expect(() => paymentMethodSchema.parse("stripe")).not.toThrow();
        expect(() => paymentMethodSchema.parse("cash")).not.toThrow();
      });

      it("undefinedを受け入れる（オプショナル）", () => {
        expect(() => paymentMethodSchema.parse(undefined)).not.toThrow();
      });

      it("無効な決済方法を拒否する", () => {
        expect(() => paymentMethodSchema.parse("invalid")).toThrow(
          "有効な決済方法を選択してください"
        );
      });
    });
  });

  describe("Participation Form Schema", () => {
    const validFormData: ParticipationFormData = {
      inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
      nickname: "テストユーザー",
      email: "test@example.com",
      attendanceStatus: "attending",
      paymentMethod: "stripe",
    };

    it("有効なフォームデータを受け入れる", () => {
      expect(() => participationFormSchema.parse(validFormData)).not.toThrow();
    });

    it("参加ステータスがattendingの場合は決済方法が必須", () => {
      const formData = {
        ...validFormData,
        attendanceStatus: "attending" as const,
        paymentMethod: undefined,
      };
      expect(() => participationFormSchema.parse(formData)).toThrow(
        "参加を選択した場合は決済方法を選択してください"
      );
    });

    it("参加ステータスがnot_attendingの場合は決済方法は不要", () => {
      const formData = {
        ...validFormData,
        attendanceStatus: "not_attending" as const,
        paymentMethod: undefined,
      };
      expect(() => participationFormSchema.parse(formData)).not.toThrow();
    });

    it("参加ステータスがmaybeの場合は決済方法は不要", () => {
      const formData = {
        ...validFormData,
        attendanceStatus: "maybe" as const,
        paymentMethod: undefined,
      };
      expect(() => participationFormSchema.parse(formData)).not.toThrow();
    });
  });

  describe("validateParticipationField", () => {
    it("有効なフィールド値に対してエラーを返さない", () => {
      const errors = validateParticipationField("nickname", "テストユーザー");
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it("無効なフィールド値に対してエラーを返す", () => {
      const errors = validateParticipationField("email", "invalid-email");
      expect(errors.email).toBe("有効なメールアドレスを入力してください");
    });

    it("参加ステータスがattendingで決済方法が未選択の場合にエラーを返す", () => {
      const errors = validateParticipationField("attendanceStatus", "attending", {
        paymentMethod: undefined,
      });
      expect(errors.paymentMethod).toBe("参加を選択した場合は決済方法を選択してください");
    });
  });

  describe("validateParticipationForm", () => {
    const validFormData: ParticipationFormData = {
      inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
      nickname: "テストユーザー",
      email: "test@example.com",
      attendanceStatus: "attending",
      paymentMethod: "stripe",
    };

    it("有効なフォームデータに対してエラーを返さない", () => {
      const errors = validateParticipationForm(validFormData);
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it("無効なフォームデータに対してエラーを返す", () => {
      const invalidFormData = {
        ...validFormData,
        email: "invalid-email",
        nickname: "",
      };
      const errors = validateParticipationForm(invalidFormData);
      expect(errors.email).toBe("有効なメールアドレスを入力してください");
      expect(errors.nickname).toBe("ニックネームを入力してください");
    });
  });

  describe("validateParticipationFormWithDuplicateCheck", () => {
    const validFormData: ParticipationFormData = {
      inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
      nickname: "テストユーザー",
      email: "test@example.com",
      attendanceStatus: "attending",
      paymentMethod: "stripe",
    };

    it("重複なしの場合はエラーを返さない", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(false);

      const errors = await validateParticipationFormWithDuplicateCheck(validFormData, "event-id");
      expect(Object.keys(errors)).toHaveLength(0);
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("event-id", "test@example.com");
    });

    it("重複がある場合はエラーを返す", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(true);

      const errors = await validateParticipationFormWithDuplicateCheck(validFormData, "event-id");
      expect(errors.email).toBe("このメールアドレスは既に登録されています");
    });

    it("基本検証でエラーがある場合は重複チェックをスキップする", async () => {
      const invalidFormData = {
        ...validFormData,
        email: "invalid-email",
      };

      const errors = await validateParticipationFormWithDuplicateCheck(invalidFormData, "event-id");
      expect(errors.email).toBe("有効なメールアドレスを入力してください");
      expect(mockCheckDuplicateEmail).not.toHaveBeenCalled();
    });

    it("重複チェックでエラーが発生した場合は一般エラーを返す", async () => {
      mockCheckDuplicateEmail.mockRejectedValue(new Error("Database error"));

      const errors = await validateParticipationFormWithDuplicateCheck(validFormData, "event-id");
      expect(errors.general).toBe("登録の確認中にエラーが発生しました");
    });
  });

  describe("sanitizeParticipationInput", () => {
    describe("nickname", () => {
      it("前後の空白を除去する", () => {
        const result = sanitizeParticipationInput.nickname("  テストユーザー  ");
        expect(result).toBe("テストユーザー");
      });

      it("空文字列の場合は空文字列を返す", () => {
        const result = sanitizeParticipationInput.nickname("");
        expect(result).toBe("");
      });

      it("HTMLタグを除去する", () => {
        const result = sanitizeParticipationInput.nickname(
          "<script>alert('xss')</script>テストユーザー"
        );
        expect(result).toBe("テストユーザー");
      });
    });

    describe("email", () => {
      it("前後の空白を除去し小文字に変換する", () => {
        const result = sanitizeParticipationInput.email("  TEST@EXAMPLE.COM  ");
        expect(result).toBe("test@example.com");
      });

      it("空文字列の場合は空文字列を返す", () => {
        const result = sanitizeParticipationInput.email("");
        expect(result).toBe("");
      });

      it("HTMLタグを除去する", () => {
        const result = sanitizeParticipationInput.email(
          "<script>alert('xss')</script>test@example.com"
        );
        expect(result).toBe("test@example.com");
      });
    });
  });
});
