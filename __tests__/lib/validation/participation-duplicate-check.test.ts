import { checkDuplicateEmail } from "@/lib/utils/invite-token";
import { validateParticipationFormWithDuplicateCheck } from "@/lib/validations/participation";
import type { ParticipationFormData } from "@/lib/validations/participation";

// モック設定
jest.mock("@/lib/utils/invite-token", () => ({
  checkDuplicateEmail: jest.fn(),
}));

const mockCheckDuplicateEmail = checkDuplicateEmail as jest.MockedFunction<
  typeof checkDuplicateEmail
>;

describe("Participation Form Duplicate Email Check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validFormData: ParticipationFormData = {
    inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
    nickname: "テストユーザー",
    email: "test@example.com",
    attendanceStatus: "attending",
    paymentMethod: "stripe",
  };

  describe("validateParticipationFormWithDuplicateCheck", () => {
    it("重複チェックが正常に動作し、重複なしの場合はエラーを返さない", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(false);

      const errors = await validateParticipationFormWithDuplicateCheck(
        validFormData,
        "test-event-id"
      );

      expect(Object.keys(errors)).toHaveLength(0);
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("test-event-id", "test@example.com");
      expect(mockCheckDuplicateEmail).toHaveBeenCalledTimes(1);
    });

    it("重複チェックで重複が検出された場合は適切なエラーを返す", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(true);

      const errors = await validateParticipationFormWithDuplicateCheck(
        validFormData,
        "test-event-id"
      );

      expect(errors.email).toBe("このメールアドレスは既に登録されています");
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("test-event-id", "test@example.com");
    });

    it("メールアドレスが正規化されてから重複チェックされる", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(false);

      const formDataWithUpperCaseEmail = {
        ...validFormData,
        email: "  TEST@EXAMPLE.COM  ",
      };

      const errors = await validateParticipationFormWithDuplicateCheck(
        formDataWithUpperCaseEmail,
        "test-event-id"
      );

      expect(Object.keys(errors)).toHaveLength(0);
      // メールアドレスが小文字に変換されて重複チェックされることを確認
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("test-event-id", "test@example.com");
    });

    it("基本検証でエラーがある場合は重複チェックをスキップする", async () => {
      const invalidFormData = {
        ...validFormData,
        email: "invalid-email-format",
        nickname: "", // 空のニックネーム
      };

      const errors = await validateParticipationFormWithDuplicateCheck(
        invalidFormData,
        "test-event-id"
      );

      // 基本検証エラーが返される
      expect(errors.email).toBe("有効なメールアドレスを入力してください");
      expect(errors.nickname).toBe("ニックネームを入力してください");

      // 重複チェックは実行されない
      expect(mockCheckDuplicateEmail).not.toHaveBeenCalled();
    });

    it("重複チェック中にエラーが発生した場合は一般エラーを返す", async () => {
      mockCheckDuplicateEmail.mockRejectedValue(new Error("Database connection error"));

      const errors = await validateParticipationFormWithDuplicateCheck(
        validFormData,
        "test-event-id"
      );

      expect(errors.general).toBe("登録の確認中にエラーが発生しました");
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("test-event-id", "test@example.com");
    });

    it("参加ステータスがnot_attendingでも重複チェックが実行される", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(false);

      const formDataNotAttending = {
        ...validFormData,
        attendanceStatus: "not_attending" as const,
        paymentMethod: undefined,
      };

      const errors = await validateParticipationFormWithDuplicateCheck(
        formDataNotAttending,
        "test-event-id"
      );

      expect(Object.keys(errors)).toHaveLength(0);
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("test-event-id", "test@example.com");
    });

    it("参加ステータスがmaybeでも重複チェックが実行される", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(false);

      const formDataMaybe = {
        ...validFormData,
        attendanceStatus: "maybe" as const,
        paymentMethod: undefined,
      };

      const errors = await validateParticipationFormWithDuplicateCheck(
        formDataMaybe,
        "test-event-id"
      );

      expect(Object.keys(errors)).toHaveLength(0);
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("test-event-id", "test@example.com");
    });

    it("複数の基本検証エラーがある場合でも重複チェックはスキップされる", async () => {
      const multipleErrorsFormData = {
        inviteToken: "invalid-token", // 無効なトークン
        nickname: "", // 空のニックネーム
        email: "invalid-email", // 無効なメールアドレス
        attendanceStatus: "attending" as const,
        paymentMethod: undefined, // 参加なのに決済方法未選択
      };

      const errors = await validateParticipationFormWithDuplicateCheck(
        multipleErrorsFormData,
        "test-event-id"
      );

      // 複数のエラーが返される
      expect(Object.keys(errors).length).toBeGreaterThan(1);
      expect(errors.inviteToken).toBeDefined();
      expect(errors.nickname).toBeDefined();
      expect(errors.email).toBeDefined();

      // 重複チェックは実行されない
      expect(mockCheckDuplicateEmail).not.toHaveBeenCalled();
    });
  });
});
