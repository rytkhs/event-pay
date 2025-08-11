/**
 * 手動送金Server Action統合テスト
 */

import { processManualPayoutAction } from "@/app/payouts/actions/process-manual-payout";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PayoutStatus } from "@/lib/services/payout/types";

// テスト用のSupabaseクライアント
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// モック設定
jest.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn(),
    },
  }),
}));

jest.mock("@/lib/rate-limit", () => ({
  createRateLimitStore: jest.fn().mockResolvedValue({}),
  checkRateLimit: jest.fn().mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetTime: Date.now() + 60000,
  }),
}));

// Stripe APIのモック
jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    transfers: {
      create: jest.fn().mockResolvedValue({
        id: "tr_test_123",
        amount: 1000,
        destination: "acct_test_123",
        created: Math.floor(Date.now() / 1000),
        metadata: {},
      }),
    },
  })),
}));

describe("processManualPayoutAction Integration", () => {
  let testUserId: string;
  let testEventId: string;
  let testStripeAccountId: string;

  beforeAll(async () => {
    // テストデータのセットアップ
    await setupTestData();
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    await cleanupTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function setupTestData() {
    // テストユーザーの作成
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert({
        email: "manual-payout-test@example.com",
        name: "Manual Payout Test User",
      })
      .select("id")
      .single();

    if (userError) throw userError;
    testUserId = userData.id;

    // テストイベントの作成（5日以上前の日付）
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() - 6); // 6日前

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        title: "Manual Payout Test Event",
        description: "Test event for manual payout",
        date: eventDate.toISOString().split("T")[0],
        time: "18:00",
        location: "Test Location",
        fee: 1000,
        capacity: 10,
        deadline: eventDate.toISOString().split("T")[0],
        status: "past",
        created_by: testUserId,
      })
      .select("id")
      .single();

    if (eventError) throw eventError;
    testEventId = eventData.id;

    // Stripe Connectアカウントの作成
    testStripeAccountId = "acct_test_manual_payout";
    const { error: connectError } = await supabase
      .from("stripe_connect_accounts")
      .insert({
        user_id: testUserId,
        stripe_account_id: testStripeAccountId,
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (connectError) throw connectError;

    // テスト参加者と決済の作成
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendances")
      .insert({
        event_id: testEventId,
        user_id: testUserId,
        status: "attending",
        nickname: "Test Participant",
      })
      .select("id")
      .single();

    if (attendanceError) throw attendanceError;

    // Stripe決済レコードの作成
    const { error: paymentError } = await supabase
      .from("payments")
      .insert({
        attendance_id: attendanceData.id,
        method: "stripe",
        amount: 1000,
        status: "paid",
        stripe_payment_intent_id: "pi_test_manual_payout",
        paid_at: new Date().toISOString(),
      });

    if (paymentError) throw paymentError;
  }

  async function cleanupTestData() {
    if (testEventId) {
      // 関連データの削除（外部キー制約により順序重要）
      await supabase.from("payments").delete().eq("attendance_id", testEventId);
      await supabase.from("attendances").delete().eq("event_id", testEventId);
      await supabase.from("payouts").delete().eq("event_id", testEventId);
      await supabase.from("events").delete().eq("id", testEventId);
    }

    if (testUserId) {
      await supabase.from("stripe_connect_accounts").delete().eq("user_id", testUserId);
      await supabase.from("users").delete().eq("id", testUserId);
    }

    // システムログのクリーンアップ
    await supabase
      .from("system_logs")
      .delete()
      .eq("operation_type", "manual_payout_execution");
    await supabase
      .from("system_logs")
      .delete()
      .eq("operation_type", "manual_payout_error");
  }

  describe("正常系", () => {
    it("手動送金が正常に実行される", async () => {
      // 認証ユーザーのモック
      const mockCreateClient = require("@/lib/supabase/server").createClient;
      mockCreateClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testUserId } },
            error: null,
          }),
        },
      });

      const result = await processManualPayoutAction({
        eventId: testEventId,
        notes: "統合テスト用手動送金",
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.payoutId).toBeDefined();
        expect(result.data.transferId).toBeDefined();
        expect(result.data.netAmount).toBeGreaterThan(0);
        expect(result.data.isManual).toBe(true);

        // データベースに送金レコードが作成されていることを確認
        const { data: payoutData, error: payoutError } = await supabase
          .from("payouts")
          .select("*")
          .eq("id", result.data.payoutId)
          .single();

        expect(payoutError).toBeNull();
        expect(payoutData).toBeDefined();
        expect(payoutData.event_id).toBe(testEventId);
        expect(payoutData.user_id).toBe(testUserId);
        expect(payoutData.status).toBe("processing");
        expect(payoutData.notes).toContain("手動実行");
        expect(payoutData.stripe_transfer_id).toBeDefined();

        // 監査ログが記録されていることを確認
        const { data: logData, error: logError } = await supabase
          .from("system_logs")
          .select("*")
          .eq("operation_type", "manual_payout_execution")
          .eq("details->>payoutId", result.data.payoutId)
          .single();

        expect(logError).toBeNull();
        expect(logData).toBeDefined();
        expect(logData.details).toMatchObject({
          payoutId: result.data.payoutId,
          eventId: testEventId,
          userId: testUserId,
          notes: "統合テスト用手動送金",
        });
      }
    });
  });

  describe("実行条件エラー", () => {
    it("既に送金済みのイベントでエラーが返される", async () => {
      // 認証ユーザーのモック
      const mockCreateClient = require("@/lib/supabase/server").createClient;
      mockCreateClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testUserId } },
            error: null,
          }),
        },
      });

      // 既存の送金レコードを作成
      const { data: existingPayoutData, error: existingPayoutError } = await supabase
        .from("payouts")
        .insert({
          event_id: testEventId,
          user_id: testUserId,
          total_stripe_sales: 1000,
          total_stripe_fee: 36,
          platform_fee: 0,
          net_payout_amount: 964,
          status: "completed" as PayoutStatus,
          stripe_account_id: testStripeAccountId,
          stripe_transfer_id: "tr_existing_123",
          processed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      expect(existingPayoutError).toBeNull();

      const result = await processManualPayoutAction({
        eventId: testEventId,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
        expect(result.error).toBe("手動送金の実行条件を満たしていません。");
        expect(result.details?.reasons).toContain("このイベントの送金処理は既に完了済みです");
      }

      // 既存の送金レコードをクリーンアップ
      await supabase.from("payouts").delete().eq("id", existingPayoutData.id);
    });

    it("イベント終了から5日経過していない場合エラーが返される", async () => {
      // 新しいイベント（1日前）を作成
      const recentEventDate = new Date();
      recentEventDate.setDate(recentEventDate.getDate() - 1); // 1日前

      const { data: recentEventData, error: recentEventError } = await supabase
        .from("events")
        .insert({
          title: "Recent Test Event",
          description: "Recent test event",
          date: recentEventDate.toISOString().split("T")[0],
          time: "18:00",
          location: "Test Location",
          fee: 1000,
          capacity: 10,
          deadline: recentEventDate.toISOString().split("T")[0],
          status: "past",
          created_by: testUserId,
        })
        .select("id")
        .single();

      expect(recentEventError).toBeNull();

      // 認証ユーザーのモック
      const mockCreateClient = require("@/lib/supabase/server").createClient;
      mockCreateClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testUserId } },
            error: null,
          }),
        },
      });

      const result = await processManualPayoutAction({
        eventId: recentEventData.id,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
        expect(result.details?.reasons).toEqual(
          expect.arrayContaining([
            expect.stringContaining("イベント終了から5日経過していません"),
          ])
        );
      }

      // テストイベントをクリーンアップ
      await supabase.from("events").delete().eq("id", recentEventData.id);
    });
  });

  describe("権限エラー", () => {
    it("他のユーザーのイベントで手動送金を試行するとエラーが返される", async () => {
      // 別のユーザーを作成
      const { data: otherUserData, error: otherUserError } = await supabase
        .from("users")
        .insert({
          email: "other-user@example.com",
          name: "Other User",
        })
        .select("id")
        .single();

      expect(otherUserError).toBeNull();

      // 別のユーザーでの認証をモック
      const mockCreateClient = require("@/lib/supabase/server").createClient;
      mockCreateClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: otherUserData.id } },
            error: null,
          }),
        },
      });

      const result = await processManualPayoutAction({
        eventId: testEventId,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
        expect(result.details?.reasons).toEqual(
          expect.arrayContaining([
            expect.stringContaining("アクセス権限がありません"),
          ])
        );
      }

      // テストユーザーをクリーンアップ
      await supabase.from("users").delete().eq("id", otherUserData.id);
    });
  });

  describe("Stripe Connectアカウントエラー", () => {
    it("Stripe Connectアカウントが設定されていない場合エラーが返される", async () => {
      // Stripe Connectアカウントを削除
      await supabase
        .from("stripe_connect_accounts")
        .delete()
        .eq("user_id", testUserId);

      // 認証ユーザーのモック
      const mockCreateClient = require("@/lib/supabase/server").createClient;
      mockCreateClient.mockReturnValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: testUserId } },
            error: null,
          }),
        },
      });

      const result = await processManualPayoutAction({
        eventId: testEventId,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.code).toBe("BUSINESS_RULE_VIOLATION");
        expect(result.details?.reasons).toEqual(
          expect.arrayContaining([
            expect.stringContaining("Stripe Connectアカウントが設定されていません"),
          ])
        );
      }

      // Stripe Connectアカウントを復元
      await supabase.from("stripe_connect_accounts").insert({
        user_id: testUserId,
        stripe_account_id: testStripeAccountId,
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  });
});
