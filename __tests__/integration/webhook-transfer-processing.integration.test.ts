import { StripeWebhookEventHandler } from "@/lib/services/webhook/webhook-event-handler";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { SecurityReporter } from "@/lib/security/security-reporter.types";
import Stripe from "stripe";

// テスト用のSupabaseクライアント
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// SecurityReporterのモック
const mockSecurityReporter = {
  logSecurityEvent: jest.fn(),
  logSuspiciousActivity: jest.fn(),
} as unknown as SecurityReporter;

describe("Webhook Transfer Processing Integration", () => {
  let handler: StripeWebhookEventHandler;
  let testEventId: string;
  let testUserId: string;
  let testPayoutId: string;

  beforeAll(async () => {
    handler = new StripeWebhookEventHandler(mockSecurityReporter);

    // テスト用のユーザーを作成
    const { data: userData, error: userError } = await supabase
      .from("users")
      .insert({
        email: "test-transfer@example.com",
        name: "Transfer Test User",
      })
      .select("id")
      .single();

    if (userError || !userData) {
      throw new Error(`Failed to create test user: ${userError?.message}`);
    }
    testUserId = userData.id;

    // テスト用のイベントを作成
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        title: "Transfer Test Event",
        description: "Test event for transfer webhook processing",
        date: new Date(Date.now() + 86400000).toISOString(), // 明日
        capacity: 10,
        fee: 1000,
        payment_deadline: new Date(Date.now() + 43200000).toISOString(), // 12時間後
        created_by: testUserId,
      })
      .select("id")
      .single();

    if (eventError || !eventData) {
      throw new Error(`Failed to create test event: ${eventError?.message}`);
    }
    testEventId = eventData.id;

    // テスト用のStripe Connectアカウントを作成
    await supabase.from("stripe_connect_accounts").insert({
      user_id: testUserId,
      stripe_account_id: "acct_test_123",
      status: "verified",
      charges_enabled: true,
      payouts_enabled: true,
    });

    // テスト用の送金レコードを作成
    const { data: payoutData, error: payoutError } = await supabase
      .from("payouts")
      .insert({
        event_id: testEventId,
        user_id: testUserId,
        total_stripe_sales: 1000,
        total_stripe_fee: 36,
        platform_fee: 0,
        net_payout_amount: 964,
        status: "pending",
        stripe_account_id: "acct_test_123",
      })
      .select("id")
      .single();

    if (payoutError || !payoutData) {
      throw new Error(`Failed to create test payout: ${payoutError?.message}`);
    }
    testPayoutId = payoutData.id;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testPayoutId) {
      await supabase.from("payouts").delete().eq("id", testPayoutId);
    }
    if (testEventId) {
      await supabase.from("events").delete().eq("id", testEventId);
    }
    if (testUserId) {
      await supabase.from("stripe_connect_accounts").delete().eq("user_id", testUserId);
      await supabase.from("users").delete().eq("id", testUserId);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("transfer.created イベント処理", () => {
    it("送金作成イベントで送金ステータスを completed に更新する", async () => {
      const transferCreatedEvent = {
        id: "evt_transfer_created_test",
        type: "transfer.created",
        data: {
          object: {
            id: "tr_test_123",
            amount: 964,
            currency: "jpy",
            destination: "acct_test_123",
          },
        },
      } as Stripe.TransferCreatedEvent;

      // 送金レコードのstripe_transfer_idを設定
      await supabase
        .from("payouts")
        .update({ stripe_transfer_id: "tr_test_123" })
        .eq("id", testPayoutId);

      const result = await handler.handleEvent(transferCreatedEvent);

      expect(result.success).toBe(true);

      // データベースの状態を確認
      const { data: updatedPayout } = await supabase
        .from("payouts")
        .select("status, processed_at, webhook_event_id")
        .eq("id", testPayoutId)
        .single();

      expect(updatedPayout?.status).toBe("completed");
      expect(updatedPayout?.processed_at).toBeTruthy();
      expect(updatedPayout?.webhook_event_id).toBe("evt_transfer_created_test");
    });
  });

  describe("transfer.updated イベント処理", () => {
    it("送金更新イベントを適切にログに記録する", async () => {
      const transferUpdatedEvent = {
        id: "evt_transfer_updated_test",
        type: "transfer.updated",
        data: {
          object: {
            id: "tr_test_123",
            amount: 964,
            currency: "jpy",
          },
        },
      } as Stripe.TransferUpdatedEvent;

      const result = await handler.handleEvent(transferUpdatedEvent);

      expect(result.success).toBe(true);
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_transfer_updated_processed",
        details: {
          eventId: "evt_transfer_updated_test",
          payoutId: testPayoutId,
          transferId: "tr_test_123",
          currentPayoutStatus: "completed", // 前のテストで completed になっている
        },
      });
    });
  });

  describe("transfer.reversed イベント処理", () => {
    it("送金リバーサルイベントで送金ステータスを failed に更新する", async () => {
      // 送金ステータスを processing に戻す
      await supabase
        .from("payouts")
        .update({ status: "processing" })
        .eq("id", testPayoutId);

      const transferReversedEvent = {
        id: "evt_transfer_reversed_test",
        type: "transfer.reversed",
        data: {
          object: {
            id: "tr_test_123",
            amount: 964,
            currency: "jpy",
            reversals: {
              data: [
                {
                  reason: "fraudulent",
                },
              ],
            },
          },
        },
      } as Stripe.TransferReversedEvent;

      const result = await handler.handleEvent(transferReversedEvent);

      expect(result.success).toBe(true);

      // データベースの状態を確認
      const { data: updatedPayout } = await supabase
        .from("payouts")
        .select("status, last_error, webhook_event_id")
        .eq("id", testPayoutId)
        .single();

      expect(updatedPayout?.status).toBe("failed");
      expect(updatedPayout?.last_error).toBe("Transfer reversed: fraudulent");
      expect(updatedPayout?.webhook_event_id).toBe("evt_transfer_reversed_test");
    });
  });

  describe("transfer.failed イベント処理", () => {
    it("送金失敗イベントで送金ステータスを failed に更新する", async () => {
      // 送金ステータスを processing に戻す
      await supabase
        .from("payouts")
        .update({ status: "processing", last_error: null })
        .eq("id", testPayoutId);

      const transferFailedEvent = {
        id: "evt_transfer_failed_test",
        type: "transfer.failed",
        data: {
          object: {
            id: "tr_test_123",
            amount: 964,
            currency: "jpy",
            failure_reason: "insufficient_funds",
          },
        },
      } as Stripe.Event;

      const result = await handler.handleEvent(transferFailedEvent);

      expect(result.success).toBe(true);

      // データベースの状態を確認
      const { data: updatedPayout } = await supabase
        .from("payouts")
        .select("status, last_error, webhook_event_id")
        .eq("id", testPayoutId)
        .single();

      expect(updatedPayout?.status).toBe("failed");
      expect(updatedPayout?.last_error).toBe("Transfer failed: insufficient_funds");
      expect(updatedPayout?.webhook_event_id).toBe("evt_transfer_failed_test");
    });
  });

  describe("冪等性テスト", () => {
    it("同じイベントを複数回処理しても結果が変わらない", async () => {
      // 送金ステータスを pending に戻す
      await supabase
        .from("payouts")
        .update({
          status: "pending",
          processed_at: null,
          webhook_event_id: null,
          last_error: null
        })
        .eq("id", testPayoutId);

      const transferCreatedEvent = {
        id: "evt_idempotency_test",
        type: "transfer.created",
        data: {
          object: {
            id: "tr_test_123",
            amount: 964,
            currency: "jpy",
            destination: "acct_test_123",
          },
        },
      } as Stripe.TransferCreatedEvent;

      // 1回目の処理
      const result1 = await handler.handleEvent(transferCreatedEvent);
      expect(result1.success).toBe(true);

      // データベースの状態を確認
      const { data: payout1 } = await supabase
        .from("payouts")
        .select("status, processed_at, webhook_event_id")
        .eq("id", testPayoutId)
        .single();

      expect(payout1?.status).toBe("completed");
      const firstProcessedAt = payout1?.processed_at;

      // 2回目の処理（同じイベント）
      const result2 = await handler.handleEvent(transferCreatedEvent);
      expect(result2.success).toBe(true);

      // データベースの状態が変わっていないことを確認
      const { data: payout2 } = await supabase
        .from("payouts")
        .select("status, processed_at, webhook_event_id")
        .eq("id", testPayoutId)
        .single();

      expect(payout2?.status).toBe("completed");
      expect(payout2?.processed_at).toBe(firstProcessedAt); // 時刻が変わっていない
      expect(payout2?.webhook_event_id).toBe("evt_idempotency_test");

      // 重複処理防止のログが記録されていることを確認
      expect(mockSecurityReporter.logSecurityEvent).toHaveBeenCalledWith({
        type: "webhook_duplicate_processing_prevented",
        details: {
          eventId: "evt_idempotency_test",
          payoutId: testPayoutId,
          currentStatus: "completed",
        },
      });
    });
  });
});
