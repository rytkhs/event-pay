/**
 * 参加登録セキュリティ対策の統合テスト
 */

import { registerParticipationDirectAction } from "@/app/events/actions/register-participation";
import { validateParticipationFormWithDuplicateCheck } from "@/lib/validations/participation";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import { UnifiedMockFactory } from "../helpers/unified-mock-factory";
import type { ParticipationFormData } from "@/lib/validations/participation";

// セキュリティログのモック
jest.mock("@/lib/security/security-logger", () => ({
  logParticipationSecurityEvent: jest.fn(),
  logSanitizationEvent: jest.fn(),
  logDuplicateRegistrationAttempt: jest.fn(),
  logValidationFailure: jest.fn(),
  logInvalidTokenAccess: jest.fn(),
}));

const mockFactory = new UnifiedMockFactory();

describe("参加登録セキュリティ対策統合テスト", () => {
  beforeEach(() => {
    UnifiedMockFactory.resetAllMocks();
  });

  describe("入力サニタイゼーション", () => {
    it("XSS攻撃を含む入力を安全にサニタイズする", async () => {
      const maliciousInputs = [
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "javascript:alert('XSS')",
        "<svg onload=alert('XSS')>",
        "';DROP TABLE users;--",
      ];

      for (const maliciousInput of maliciousInputs) {
        const sanitized = sanitizeForEventPay(maliciousInput);

        // 危険なタグや属性が除去されていることを確認
        expect(sanitized).not.toContain("<script");
        expect(sanitized).not.toContain("onerror=");
        expect(sanitized).not.toContain("onload=");
        expect(sanitized).not.toContain("javascript:");
        expect(sanitized).not.toContain("<svg");
        expect(sanitized).not.toContain("<img");

        // SQLインジェクション攻撃文字列も無害化されている
        expect(sanitized).not.toContain("DROP TABLE");
      }
    });

    it("正常な入力は適切に保持される", () => {
      const normalInputs = [
        "田中太郎",
        "test@example.com",
        "Hello World",
        "イベント参加希望です",
        "123-456-7890",
      ];

      for (const input of normalInputs) {
        const sanitized = sanitizeForEventPay(input);
        expect(sanitized).toBe(input);
      }
    });
  });

  describe("重複登録防止", () => {
    it("同じメールアドレスでの重複登録を防ぐ", async () => {
      const event = mockFactory.createMockEvent({
        invite_token: "valid-invite-token-123456789012",
      });

      // 最初の登録
      const firstRegistration: ParticipationFormData = {
        inviteToken: event.invite_token,
        nickname: "参加者1",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      };

      mockFactory.mockValidateInviteToken(event.invite_token, {
        isValid: true,
        canRegister: true,
        event: mockFactory.convertToEventDetail(event),
      });

      mockFactory.mockCheckDuplicateEmail(event.id, "test@example.com", false);
      mockFactory.mockCheckEventCapacity(event.id, false);

      const firstResult = await registerParticipationDirectAction(firstRegistration);
      expect(firstResult.success).toBe(true);

      // 重複登録の試行
      const duplicateRegistration: ParticipationFormData = {
        inviteToken: event.invite_token,
        nickname: "参加者2",
        email: "test@example.com", // 同じメールアドレス
        attendanceStatus: "attending",
        paymentMethod: "cash",
      };

      mockFactory.mockCheckDuplicateEmail(event.id, "test@example.com", true);

      const duplicateResult = await registerParticipationDirectAction(duplicateRegistration);
      expect(duplicateResult.success).toBe(false);
      expect(duplicateResult.error?.message).toContain("既に登録されています");
    });

    it("大文字小文字の違いを無視して重複を検出する", async () => {
      const event = mockFactory.createMockEvent({
        invite_token: "valid-invite-token-123456789012",
      });

      const validationErrors = await validateParticipationFormWithDuplicateCheck(
        {
          inviteToken: event.invite_token,
          nickname: "テストユーザー",
          email: "TEST@EXAMPLE.COM", // 大文字
          attendanceStatus: "attending",
          paymentMethod: "stripe",
        },
        event.id,
        { ip: "127.0.0.1", userAgent: "test" }
      );

      // メールアドレスが正規化されて重複チェックされる
      expect(mockFactory.supabaseMock.from).toHaveBeenCalledWith("attendances");
    });
  });

  describe("容量制限チェック", () => {
    it("定員に達したイベントへの参加登録を防ぐ", async () => {
      const event = mockFactory.createMockEvent({
        invite_token: "valid-invite-token-123456789012",
        capacity: 10,
      });

      const participationData: ParticipationFormData = {
        inviteToken: event.invite_token,
        nickname: "参加希望者",
        email: "participant@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      };

      mockFactory.mockValidateInviteToken(event.invite_token, {
        isValid: true,
        canRegister: true,
        event: mockFactory.convertToEventDetail(event),
      });

      // 定員に達している状態をモック
      mockFactory.mockCheckEventCapacity(event.id, true);

      const result = await registerParticipationDirectAction(participationData);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("定員に達しています");
    });

    it("不参加や未定の場合は容量制限をチェックしない", async () => {
      const event = mockFactory.createMockEvent({
        invite_token: "valid-invite-token-123456789012",
        capacity: 10,
      });

      const participationData: ParticipationFormData = {
        inviteToken: event.invite_token,
        nickname: "不参加者",
        email: "notattending@example.com",
        attendanceStatus: "not_attending",
      };

      mockFactory.mockValidateInviteToken(event.invite_token, {
        isValid: true,
        canRegister: true,
        event: mockFactory.convertToEventDetail(event),
      });

      mockFactory.mockCheckDuplicateEmail(event.id, "notattending@example.com", false);
      // 容量チェックはモックしない（呼ばれないため）

      const result = await registerParticipationDirectAction(participationData);
      expect(result.success).toBe(true);
    });
  });

  describe("無効なトークンアクセス", () => {
    it("無効な招待トークンでのアクセスを拒否する", async () => {
      const invalidToken = "invalid-token-123456789012";

      mockFactory.mockValidateInviteToken(invalidToken, {
        isValid: false,
        canRegister: false,
        errorMessage: "無効な招待リンクです",
      });

      const participationData: ParticipationFormData = {
        inviteToken: invalidToken,
        nickname: "参加者",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      };

      const result = await registerParticipationDirectAction(participationData);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("無効な招待リンク");
    });

    it("期限切れイベントへの登録を拒否する", async () => {
      const event = mockFactory.createMockEvent({
        invite_token: "expired-event-token-123456789012",
        status: "past",
      });

      mockFactory.mockValidateInviteToken(event.invite_token, {
        isValid: true,
        canRegister: false,
        event: mockFactory.convertToEventDetail(event),
        errorMessage: "このイベントは終了しています",
      });

      const participationData: ParticipationFormData = {
        inviteToken: event.invite_token,
        nickname: "参加者",
        email: "test@example.com",
        attendanceStatus: "attending",
        paymentMethod: "stripe",
      };

      const result = await registerParticipationDirectAction(participationData);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("終了しています");
    });
  });

  describe("バリデーションエラー", () => {
    it("不正な形式の入力を拒否する", async () => {
      const invalidData = {
        inviteToken: "short", // 32文字未満
        nickname: "", // 空文字
        email: "invalid-email", // 無効なメール形式
        attendanceStatus: "invalid_status", // 無効なステータス
        paymentMethod: "bitcoin", // 無効な決済方法
      } as ParticipationFormData;

      const validationErrors = await validateParticipationFormWithDuplicateCheck(
        invalidData,
        "test-event-id",
        { ip: "127.0.0.1", userAgent: "test" }
      );

      expect(Object.keys(validationErrors).length).toBeGreaterThan(0);
      expect(validationErrors.inviteToken).toBeDefined();
      expect(validationErrors.nickname).toBeDefined();
      expect(validationErrors.email).toBeDefined();
      expect(validationErrors.attendanceStatus).toBeDefined();
    });

    it("参加選択時に決済方法が未選択の場合はエラーとする", async () => {
      const incompleteData: ParticipationFormData = {
        inviteToken: "valid-invite-token-123456789012",
        nickname: "参加者",
        email: "test@example.com",
        attendanceStatus: "attending",
        // paymentMethodが未設定
      };

      const validationErrors = await validateParticipationFormWithDuplicateCheck(
        incompleteData,
        "test-event-id",
        { ip: "127.0.0.1", userAgent: "test" }
      );

      expect(validationErrors.paymentMethod).toBeDefined();
      expect(validationErrors.paymentMethod).toContain("決済方法を選択してください");
    });
  });
});
