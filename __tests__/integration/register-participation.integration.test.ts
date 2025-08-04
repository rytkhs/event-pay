import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { registerParticipationAction } from "@/app/events/actions/register-participation";
import { ERROR_CODES } from "@/lib/types/server-actions";

describe("参加登録サーバーアクション統合テスト", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("バリデーションエラーが正しく処理される", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "invalid-short-token"); // 36文字未満の無効なトークン
    formData.append("nickname", "テストユーザー");
    formData.append("email", "test@example.com");
    formData.append("attendanceStatus", "attending");
    formData.append("paymentMethod", "stripe");

    const result = await registerParticipationAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(result.error).toContain("無効な招待トークンの形式です");
    }
  });

  it("必須フィールドが不足している場合エラーになる", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "abcdefghijklmnopqrstuvwxyz123456");
    // nicknameが不足
    formData.append("email", "test@example.com");
    formData.append("attendanceStatus", "attending");
    formData.append("paymentMethod", "stripe");

    const result = await registerParticipationAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it("参加ステータスが「参加」で決済方法が未選択の場合エラーになる", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "abcdefghijklmnopqrstuvwxyz123456");
    formData.append("nickname", "テストユーザー");
    formData.append("email", "test@example.com");
    formData.append("attendanceStatus", "attending");
    // paymentMethodが不足

    const result = await registerParticipationAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });

  it("無効なメールアドレス形式でエラーになる", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "abcdefghijklmnopqrstuvwxyz123456");
    formData.append("nickname", "テストユーザー");
    formData.append("email", "invalid-email-format");
    formData.append("attendanceStatus", "attending");
    formData.append("paymentMethod", "stripe");

    const result = await registerParticipationAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(result.error).toContain("有効なメールアドレスを入力してください");
    }
  });

  it("無効な参加ステータスでエラーになる", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "abcdefghijklmnopqrstuvwxyz123456");
    formData.append("nickname", "テストユーザー");
    formData.append("email", "test@example.com");
    formData.append("attendanceStatus", "invalid-status");
    formData.append("paymentMethod", "stripe");

    const result = await registerParticipationAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });
});
