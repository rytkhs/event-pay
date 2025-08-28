import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { registerParticipationAction } from "@/app/events/actions/register-participation";
import { ERROR_CODES } from "@/lib/types/server-actions";

// モック設定
const mockValidateInviteToken = jest.fn();
const mockCheckEventCapacity = jest.fn();
const mockCheckDuplicateEmail = jest.fn();

jest.mock("@/lib/utils/invite-token", () => ({
  validateInviteToken: mockValidateInviteToken,
  checkEventCapacity: mockCheckEventCapacity,
  checkDuplicateEmail: mockCheckDuplicateEmail,
}));

jest.mock("@/lib/security/crypto", () => ({
  generateRandomBytes: jest.fn(
    () =>
      new Uint8Array([
        116, 101, 115, 116, 45, 114, 97, 110, 100, 111, 109, 45, 98, 121, 116, 101, 115, 45, 102,
        111, 114, 45, 116, 111, 107, 101, 110,
      ])
  ), // "test-random-bytes-for-token" をUint8Arrayで表現
  toBase64UrlSafe: jest.fn(() => "dGVzdC1yYW5kb20tYnl0ZXMtZm9yLXRva2Vu"), // テスト用固定値
}));

// テスト用のモックデータ
const mockEvent = {
  id: "event-123",
  title: "テストイベント",
  date: "2024-12-31T10:00:00Z",
  location: "テスト会場",
  description: "テストイベントの説明",
  fee: 1000,
  capacity: 10,
  payment_methods: ["stripe", "cash"] as const,
  registration_deadline: "2024-12-30T23:59:59Z",
  payment_deadline: "2024-12-31T09:00:00Z",
  status: "upcoming" as const,
  invite_token: "abcdefghijklmnopqrstuvwxyz123456",
  attendances_count: 5,
};

const mockSupabaseClient = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(),
      })),
    })),
  })),
};

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

describe("registerParticipationAction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("参加ステータス「参加」で正常に登録できる", async () => {
    // モックの設定
    mockValidateInviteToken.mockResolvedValue({
      isValid: true,
      event: mockEvent,
      canRegister: true,
    });
    mockCheckEventCapacity.mockResolvedValue(false);
    mockCheckDuplicateEmail.mockResolvedValue(false);

    // 参加記録の作成をモック
    const mockAttendanceInsert = {
      select: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: { id: "attendance-123" },
          error: null,
        }),
      })),
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === "attendances") {
        return {
          insert: jest.fn(() => mockAttendanceInsert),
        };
      }
      if (table === "payments") {
        return {
          insert: jest.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return {};
    });

    // FormDataの作成
    const formData = new FormData();
    formData.append("inviteToken", "abcdefghijklmnopqrstuvwxyz123456");
    formData.append("nickname", "テストユーザー");
    formData.append("email", "test@example.com");
    formData.append("attendanceStatus", "attending");
    formData.append("paymentMethod", "stripe");

    // テスト実行
    const result = await registerParticipationAction(formData);

    // 検証
    console.log("Test result:", result);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attendanceId).toBe("attendance-123");
      expect(result.data.guestToken).toBeDefined();
      expect(result.data.requiresAdditionalPayment).toBe(true);
    }
  });

  it("必須フィールドが不足している場合エラーになる", async () => {
    const formData = new FormData();
    formData.append("inviteToken", "abcdefghijklmnopqrstuvwxyz123456");
    // nicknameが不足
    formData.append("email", "test@example.com");
    formData.append("attendanceStatus", "attending");

    const result = await registerParticipationAction(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });
});
