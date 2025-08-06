/**
 * 参加登録サーバーアクションの単体テスト
 * @jest-environment node
 */

import { registerParticipationAction } from "@/app/events/actions/register-participation";
import {
  validateInviteToken,
  checkEventCapacity,
  checkDuplicateEmail,
} from "@/lib/utils/invite-token";
import { generateGuestToken } from "@/lib/utils/guest-token";
import { createClient } from "@/lib/supabase/server";
import { sanitizeParticipationInput } from "@/lib/validations/participation";

// モック設定
jest.mock("@/lib/utils/invite-token", () => ({
  validateInviteToken: jest.fn(),
  checkEventCapacity: jest.fn(),
  checkDuplicateEmail: jest.fn(),
}));

jest.mock("@/lib/utils/guest-token", () => ({
  generateGuestToken: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/validations/participation", () => ({
  sanitizeParticipationInput: {
    nickname: jest.fn((input) => input?.trim() || ""),
    email: jest.fn((input) => input?.toLowerCase().trim() || ""),
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(() => ({
    get: jest.fn(() => "127.0.0.1"),
  })),
}));

const mockValidateInviteToken = validateInviteToken as jest.MockedFunction<
  typeof validateInviteToken
>;
const mockCheckEventCapacity = checkEventCapacity as jest.MockedFunction<typeof checkEventCapacity>;
const mockCheckDuplicateEmail = checkDuplicateEmail as jest.MockedFunction<
  typeof checkDuplicateEmail
>;
const mockGenerateGuestToken = generateGuestToken as jest.MockedFunction<typeof generateGuestToken>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

describe("registerParticipationAction", () => {
  const mockSupabase = {
    from: jest.fn(),
    rpc: jest.fn(),
  };

  const mockEventData = {
    id: "event-123",
    title: "テストイベント",
    date: "2024-12-31T18:00:00Z",
    location: "テスト会場",
    description: "テストイベントの説明",
    fee: 1000,
    capacity: 50,
    payment_methods: ["stripe", "cash"],
    registration_deadline: "2024-12-30T23:59:59Z",
    payment_deadline: "2024-12-31T17:00:00Z",
    status: "upcoming",
    invite_token: "abcdefghijklmnopqrstuvwxyz123456",
    attendances_count: 10,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase as any);
    mockGenerateGuestToken.mockReturnValue("generated-guest-token-123456789012");
  });

  const createFormData = (data: Record<string, string>) => {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return formData;
  };

  describe("フォームデータ検証", () => {
    it("必須フィールドが不足している場合はエラーを返す", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        // nickname, email, attendanceStatusが不足
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.error).toContain("入力データが無効です");
    });

    it("無効な招待トークンの場合はエラーを返す", async () => {
      const formData = createFormData({
        inviteToken: "invalid-token",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.error).toContain("入力データが無効です");
    });

    it("無効なメールアドレスの場合はエラーを返す", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "invalid-email",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.error).toContain("入力データが無効です");
    });

    it("参加ステータスがattendingで決済方法が未選択の場合はエラーを返す", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        // paymentMethodが不足
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("VALIDATION_ERROR");
      expect(result.error).toContain("入力データが無効です");
    });
  });

  describe("招待トークン検証", () => {
    beforeEach(() => {
      // デフォルトの有効な招待トークン設定
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(false);
      mockCheckDuplicateEmail.mockResolvedValue(false);
    });

    it("無効な招待トークンの場合はエラーを返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: false,
        canRegister: false,
        errorMessage: "招待リンクが見つかりません",
      });

      const formData = createFormData({
        inviteToken: "nonexistent-token-123456789012345678",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("NOT_FOUND");
      expect(result.error).toContain("無効な招待リンクです");
    });

    it("登録不可能なイベントの場合はエラーを返す", async () => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: false,
        errorMessage: "参加申込期限が過ぎています",
      });

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(result.error).toContain("このイベントには参加登録できません");
    });
  });

  describe("定員チェック", () => {
    beforeEach(() => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: true,
      });
      mockCheckDuplicateEmail.mockResolvedValue(false);
    });

    it("定員に達している場合で参加を選択した場合はエラーを返す", async () => {
      mockCheckEventCapacity.mockResolvedValue(true);

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(result.error).toContain("このイベントは定員に達しています");
    });

    it("定員に達していても不参加の場合は登録可能", async () => {
      mockCheckEventCapacity.mockResolvedValue(true);
      mockSupabase.rpc.mockResolvedValue({
        data: { attendance_id: "attendance-123" },
        error: null,
      });

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "not_attending",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(true);
      expect(mockCheckEventCapacity).toHaveBeenCalledWith("event-123", 50);
    });

    it("定員に達していても未定の場合は登録可能", async () => {
      mockCheckEventCapacity.mockResolvedValue(true);
      mockSupabase.rpc.mockResolvedValue({
        data: { attendance_id: "attendance-123" },
        error: null,
      });

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "maybe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(true);
    });
  });

  describe("重複チェック", () => {
    beforeEach(() => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(false);
    });

    it("重複するメールアドレスの場合はエラーを返す", async () => {
      mockCheckDuplicateEmail.mockResolvedValue(true);

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "duplicate@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("CONFLICT");
      expect(result.error).toContain("入力データに問題があります");
      expect(mockCheckDuplicateEmail).toHaveBeenCalledWith("event-123", "duplicate@example.com");
    });
  });

  describe("正常な登録処理", () => {
    beforeEach(() => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(false);
      mockCheckDuplicateEmail.mockResolvedValue(false);
      mockSupabase.rpc.mockResolvedValue({
        data: { attendance_id: "attendance-123" },
        error: null,
      });
    });

    it("参加ステータスattendingで正常に登録される", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.attendanceId).toBe("attendance-123");
      expect(result.data?.guestToken).toBe("generated-guest-token-123456789012");
      expect(result.data?.requiresPayment).toBe(true);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("register_attendance_with_payment", {
        p_event_id: "event-123",
        p_nickname: "テストユーザー",
        p_email: "test@example.com",
        p_status: "attending",
        p_payment_method: "stripe",
        p_guest_token: expect.any(String),
      });
    });

    it("参加ステータスnot_attendingで正常に登録される", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "not_attending",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresPayment).toBe(false);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("register_attendance_with_payment", {
        p_event_id: "event-123",
        p_nickname: "テストユーザー",
        p_email: "test@example.com",
        p_status: "not_attending",
        p_payment_method: null,
        p_guest_token: expect.any(String),
      });
    });

    it("参加ステータスmaybeで正常に登録される", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "maybe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresPayment).toBe(false);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("register_attendance_with_payment", {
        p_event_id: "event-123",
        p_nickname: "テストユーザー",
        p_email: "test@example.com",
        p_status: "maybe",
        p_payment_method: null,
        p_guest_token: expect.any(String),
      });
    });

    it("無料イベントの場合は決済不要", async () => {
      const freeEvent = { ...mockEventData, fee: 0 };
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: freeEvent,
        canRegister: true,
      });

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresPayment).toBe(false);

      expect(mockSupabase.rpc).toHaveBeenCalledWith("register_attendance_with_payment", {
        p_event_id: "event-123",
        p_nickname: "テストユーザー",
        p_email: "test@example.com",
        p_status: "attending",
        p_payment_method: null,
        p_guest_token: expect.any(String),
      });
    });

    it("入力値のサニタイゼーションが実行される", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "  テストユーザー  ",
        email: "  TEST@EXAMPLE.COM  ",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      await registerParticipationAction(formData);

      expect(sanitizeParticipationInput.nickname).toHaveBeenCalledWith("  テストユーザー  ");
      expect(sanitizeParticipationInput.email).toHaveBeenCalledWith("  TEST@EXAMPLE.COM  ");
    });
  });

  describe("データベースエラー処理", () => {
    beforeEach(() => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(false);
      mockCheckDuplicateEmail.mockResolvedValue(false);
    });

    it("データベース登録エラーの場合は適切なエラーメッセージを返す", async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: "Database constraint violation" },
      });

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("DATABASE_ERROR");
      expect(result.error).toContain("参加登録の処理中にエラーが発生しました");
    });

    it("予期しないエラーの場合は一般エラーメッセージを返す", async () => {
      mockSupabase.rpc.mockRejectedValue(new Error("Unexpected error"));

      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(result.success).toBe(false);
      expect(result.code).toBe("INTERNAL_ERROR");
      expect(result.error).toContain("参加登録の処理中にエラーが発生しました");
    });
  });

  describe("ゲストトークン生成", () => {
    beforeEach(() => {
      mockValidateInviteToken.mockResolvedValue({
        isValid: true,
        event: mockEventData,
        canRegister: true,
      });
      mockCheckEventCapacity.mockResolvedValue(false);
      mockCheckDuplicateEmail.mockResolvedValue(false);
      mockSupabase.rpc.mockResolvedValue({
        data: { attendance_id: "attendance-123" },
        error: null,
      });
    });

    it("ゲストトークンが正しく生成される", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      const result = await registerParticipationAction(formData);

      expect(mockGenerateGuestToken).toHaveBeenCalled();
      expect(result.data?.guestToken).toBe("generated-guest-token-123456789012");
    });

    it("ゲストトークンがデータベースに保存される", async () => {
      const formData = createFormData({
        inviteToken: "abcdefghijklmnopqrstuvwxyz123456",
        nickname: "テストユーザー",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      });

      await registerParticipationAction(formData);

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "register_participation",
        expect.objectContaining({
          p_guest_token: expect.any(String),
        })
      );
    });
  });
});
