/**
 * 手動送金実行条件検証ロジックの簡素化テスト
 * タスク7.6.1の要件8.1-8.4をテスト
 */

import { PayoutValidator } from "@/lib/services/payout/validation";
import { PayoutError, PayoutErrorType, ValidateManualPayoutParams } from "@/lib/services/payout/types";

// モック設定
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
};

const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn(),
};

// createClientのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("PayoutValidator - 手動送金実行条件検証（簡素版）", () => {
  let validator: PayoutValidator;

  beforeEach(() => {
    validator = new PayoutValidator(
      "mock-url",
      "mock-key",
      mockStripeConnectService as any
    );

    // モックのリセット
    jest.clearAllMocks();
  });

  describe("validateManualPayoutEligibility", () => {
    const baseParams: ValidateManualPayoutParams = {
      eventId: "event-123",
      userId: "user-123",
      minimumAmount: 100,
      daysAfterEvent: 5,
    };

    it("イベントが見つからない場合、適切なエラーメッセージを返す", async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("イベントが見つからないか、アクセス権限がありません");
    });

    it("主催者以外のユーザーの場合、権限エラーを返す", async () => {
      const eventWithDifferentOwner = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "other-user-123", // 異なるユーザー
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: eventWithDifferentOwner, error: null });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントの送金処理を実行する権限がありません");
    });

    it("終了済みでないイベントの場合、対象外エラーを返す", async () => {
      const activeEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "active", // 終了済みでない
      };
      mockSupabase.single.mockResolvedValue({ data: activeEvent, error: null });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("終了済みでないイベントは送金対象外です");
    });

    it("送金処理が既に完了済みの場合、手動送金が不可と判定される", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });

      // 完了済み送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "completed",
          created_at: "2024-01-06T00:00:00Z",
          processed_at: "2024-01-06T12:00:00Z",
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントの送金処理は既に完了済みです");
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("completed");
    });

    it("送金処理が実行中の場合、手動送金が不可と判定される", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });

      // 実行中送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "processing",
          created_at: "2024-01-06T00:00:00Z",
          processed_at: null,
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントの送金処理は現在実行中です");
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("processing");
    });

    it("データベースエラーが発生した場合、エラーメッセージを返す（例外をスローしない）", async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: "Database connection failed", code: "CONNECTION_ERROR" }
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("イベントが見つからないか、アクセス権限がありません");
    });
  });
});
