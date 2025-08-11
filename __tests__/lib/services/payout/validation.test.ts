/**
 * PayoutValidator の単体テスト
 */

import { PayoutValidator } from "@/lib/services/payout/validation";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { IStripeConnectService } from "@/lib/services/stripe-connect/interface";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(),
};

// StripeConnectServiceのモック
const mockStripeConnectService: jest.Mocked<IStripeConnectService> = {
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  getAccountInfo: jest.fn(),
  getConnectAccountByUser: jest.fn(),
  updateAccountStatus: jest.fn(),
  isChargesEnabled: jest.fn(),
  isPayoutsEnabled: jest.fn(),
  isAccountVerified: jest.fn(),
};

describe("PayoutValidator", () => {
  let validator: PayoutValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new PayoutValidator("https://test.supabase.co", "test-key", mockStripeConnectService);
    (validator as any).supabase = mockSupabase;
  });

  describe("validateProcessPayoutParams", () => {
    it("有効なパラメータの場合は正常に完了する", async () => {
      const params = {
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "550e8400-e29b-41d4-a716-446655440001",
        notes: "テスト送金",
      };

      await expect(validator.validateProcessPayoutParams(params)).resolves.not.toThrow();
    });

    it("eventIdが空の場合はエラーを投げる", async () => {
      const params = {
        eventId: "",
        userId: "550e8400-e29b-41d4-a716-446655440001",
      };

      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow(PayoutError);
      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow("イベントIDが指定されていません");
    });

    it("userIdが空の場合はエラーを投げる", async () => {
      const params = {
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "",
      };

      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow(PayoutError);
      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow("ユーザーIDが指定されていません");
    });

    it("eventIdがUUID形式でない場合はエラーを投げる", async () => {
      const params = {
        eventId: "invalid-uuid",
        userId: "550e8400-e29b-41d4-a716-446655440001",
      };

      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow(PayoutError);
      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow("イベントIDの形式が正しくありません");
    });

    it("userIdがUUID形式でない場合はエラーを投げる", async () => {
      const params = {
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "invalid-uuid",
      };

      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow(PayoutError);
      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow("ユーザーIDの形式が正しくありません");
    });

    it("notesが1000文字を超える場合はエラーを投げる", async () => {
      const params = {
        eventId: "550e8400-e29b-41d4-a716-446655440000",
        userId: "550e8400-e29b-41d4-a716-446655440001",
        notes: "a".repeat(1001),
      };

      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow(PayoutError);
      await expect(validator.validateProcessPayoutParams(params)).rejects.toThrow("備考は1000文字以内で入力してください");
    });
  });

  describe("validateEventEligibility", () => {
    it("有効なイベントの場合は正常に完了する", async () => {
      // イベント情報のモック
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      const mockPayoutQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      const mockPaymentQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockQuery) // events
        .mockReturnValueOnce(mockPayoutQuery) // payouts
        .mockReturnValueOnce(mockPaymentQuery); // payments

      // イベント取得
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: "2024-01-01", // 5日以上前
          created_by: "user-1",
          status: "past",
        },
        error: null,
      });

      // 既存送金レコードチェック
      mockPayoutQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Stripe決済チェック
      mockPaymentQuery.select.mockResolvedValueOnce({
        data: [
          {
            id: "payment-1",
            amount: 1000,
            attendances: { event_id: "event-1" },
          },
        ],
        error: null,
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).resolves.not.toThrow();
    });

    it("イベントが見つからない場合はエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow("指定されたイベントが見つかりません");
    });

    it("主催者でない場合はエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: "2024-01-01",
          created_by: "other-user", // 異なるユーザー
          status: "past",
        },
        error: null,
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow("このイベントの送金処理を実行する権限がありません");
    });

    it("終了済みでないイベントの場合はエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: "2024-01-01",
          created_by: "user-1",
          status: "cancelled", // キャンセル済み
        },
        error: null,
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow("終了済みでないイベントは送金対象外です");
    });

    it("イベント終了から5日経過していない場合はエラーを投げる", async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = tomorrow.toISOString().split('T')[0];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: tomorrowString, // 明日の日付
          created_by: "user-1",
          status: "past",
        },
        error: null,
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(/イベント終了から5日経過していません/);
    });

    it("既に送金済みの場合はエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      // イベント取得
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: "2024-01-01",
          created_by: "user-1",
          status: "past",
        },
        error: null,
      });

      // 既存送金レコードあり
      mockQuery.maybeSingle.mockResolvedValueOnce({
        data: {
          id: "payout-1",
          status: "completed",
        },
        error: null,
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(/このイベントの送金処理は既に実行済みです/);
    });

    it("Stripe決済がない場合はエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      // イベント取得
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: "2024-01-01",
          created_by: "user-1",
          status: "active",
        },
        error: null,
      });

      // 既存送金レコードなし
      mockQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Stripe決済なし
      mockQuery.select.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateEventEligibility("event-1", "user-1")).rejects.toThrow("このイベントには送金対象となるStripe決済がありません");
    });
  });

  describe("validateStripeConnectAccount", () => {
    it("有効なStripeConnectアカウントの場合は正常に完了する", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      await expect(validator.validateStripeConnectAccount("user-1")).resolves.not.toThrow();
    });

    it("StripeConnectアカウントが設定されていない場合はエラーを投げる", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce(null);

      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow("Stripe Connectアカウントが設定されていません");
    });

    it("アカウントが認証されていない場合はエラーを投げる", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "unverified",
        charges_enabled: false,
        payouts_enabled: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow("認証が完了していません");
    });

    it("決済受取が有効でない場合はエラーを投げる", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "verified",
        charges_enabled: false,
        payouts_enabled: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow("決済受取が有効になっていません");
    });

    it("送金が有効でない場合はエラーを投げる", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow(PayoutError);
      await expect(validator.validateStripeConnectAccount("user-1")).rejects.toThrow("送金が有効になっていません");
    });
  });

  describe("validatePayoutAmount", () => {
    it("有効な金額の場合は正常に完了する", async () => {
      await expect(validator.validatePayoutAmount(1000)).resolves.not.toThrow();
    });

    it("数値でない場合はエラーを投げる", async () => {
      await expect(validator.validatePayoutAmount("1000" as any)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount("1000" as any)).rejects.toThrow("送金金額は有効な数値である必要があります");
    });

    it("NaNの場合はエラーを投げる", async () => {
      await expect(validator.validatePayoutAmount(NaN)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount(NaN)).rejects.toThrow("送金金額は有効な数値である必要があります");
    });

    it("0以下の場合はエラーを投げる", async () => {
      await expect(validator.validatePayoutAmount(0)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount(0)).rejects.toThrow("送金金額は0円より大きい必要があります");

      await expect(validator.validatePayoutAmount(-100)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount(-100)).rejects.toThrow("送金金額は0円より大きい必要があります");
    });

    it("整数でない場合はエラーを投げる", async () => {
      await expect(validator.validatePayoutAmount(100.5)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount(100.5)).rejects.toThrow("送金金額は円単位の整数である必要があります");
    });

    it("100円未満の場合はエラーを投げる", async () => {
      await expect(validator.validatePayoutAmount(99)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount(99)).rejects.toThrow("送金金額は100円以上である必要があります");
    });

    it("1億円を超える場合はエラーを投げる", async () => {
      await expect(validator.validatePayoutAmount(100_000_001)).rejects.toThrow(PayoutError);
      await expect(validator.validatePayoutAmount(100_000_001)).rejects.toThrow("送金金額は1億円以下である必要があります");
    });
  });

  describe("validateStatusTransition", () => {
    it("有効な遷移の場合は正常に完了する", async () => {
      await expect(validator.validateStatusTransition("pending", "processing")).resolves.not.toThrow();
      await expect(validator.validateStatusTransition("processing", "completed")).resolves.not.toThrow();
      await expect(validator.validateStatusTransition("processing", "failed")).resolves.not.toThrow();
      await expect(validator.validateStatusTransition("failed", "pending")).resolves.not.toThrow();
    });

    it("同じステータスへの遷移は許可される", async () => {
      await expect(validator.validateStatusTransition("pending", "pending")).resolves.not.toThrow();
      await expect(validator.validateStatusTransition("completed", "completed")).resolves.not.toThrow();
    });

    it("無効な遷移の場合はエラーを投げる", async () => {
      await expect(validator.validateStatusTransition("completed", "pending")).rejects.toThrow(PayoutError);
      await expect(validator.validateStatusTransition("completed", "pending")).rejects.toThrow("completed から pending への遷移は許可されていません");

      await expect(validator.validateStatusTransition("pending", "completed")).rejects.toThrow(PayoutError);
      await expect(validator.validateStatusTransition("pending", "completed")).rejects.toThrow("pending から completed への遷移は許可されていません");
    });

    it("無効な現在のステータスの場合はエラーを投げる", async () => {
      await expect(validator.validateStatusTransition("invalid", "pending")).rejects.toThrow(PayoutError);
      await expect(validator.validateStatusTransition("invalid", "pending")).rejects.toThrow("無効な現在のステータスです: invalid");
    });

    it("無効な新しいステータスの場合はエラーを投げる", async () => {
      await expect(validator.validateStatusTransition("pending", "invalid")).rejects.toThrow(PayoutError);
      await expect(validator.validateStatusTransition("pending", "invalid")).rejects.toThrow("無効な新しいステータスです: invalid");
    });
  });
});
