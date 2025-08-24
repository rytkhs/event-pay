/**
 * 決済セッション作成APIの統合テスト
 */

import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { PaymentService, PaymentErrorHandler } from "@/lib/services/payment";

// テスト用のSupabaseクライアント
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

// Stripeモック
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  },
}));

import { stripe } from "@/lib/stripe/client";

describe("決済セッション作成 統合テスト", () => {
  let testUserId: string;
  let testEventId: string;
  let testAttendanceId: string;
  let paymentService: PaymentService;

  beforeAll(async () => {
    // テストデータの準備
    const errorHandler = new PaymentErrorHandler();
    paymentService = new PaymentService(supabase as any, errorHandler);

    // テストユーザー作成
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: "test-payment@example.com",
      password: "testpassword123",
      email_confirm: true,
    });

    if (userError || !userData.user) {
      throw new Error(`Failed to create test user: ${userError?.message}`);
    }

    testUserId = userData.user.id;

    // テストイベント作成
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        title: "決済テストイベント",
        description: "決済機能のテスト用イベント",
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1週間後
        location: "テスト会場",
        capacity: 10,
        fee: 1000,
        registration_deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3日後
        payment_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5日後
        payment_methods: ["stripe", "cash"],
        created_by: testUserId,
      })
      .select()
      .single();

    if (eventError || !eventData) {
      throw new Error(`Failed to create test event: ${eventError?.message}`);
    }

    testEventId = eventData.id;

    // テスト参加記録作成
    const { data: attendanceData, error: attendanceError } = await supabase
      .from("attendances")
      .insert({
        event_id: testEventId,
        nickname: "テストユーザー",
        email: "test-payment@example.com",
        status: "attending",
        guest_token: "test_token_" + Math.random().toString(36).substring(2, 15),
      })
      .select()
      .single();

    if (attendanceError || !attendanceData) {
      throw new Error(`Failed to create test attendance: ${attendanceError?.message}`);
    }

    testAttendanceId = attendanceData.id;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testAttendanceId) {
      await supabase.from("payments").delete().eq("attendance_id", testAttendanceId);
      await supabase.from("attendances").delete().eq("id", testAttendanceId);
    }
    if (testEventId) {
      await supabase.from("events").delete().eq("id", testEventId);
    }
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("PaymentService.createStripeSession", () => {
    it("正常にStripe決済セッションを作成する", async () => {
      // Stripeモックの設定
      const mockSession = {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/pay/cs_test_123",
      };

      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      // テスト実行
      const result = await paymentService.createStripeSession({
        attendanceId: testAttendanceId,
        amount: 1000,
        eventId: testEventId,
        userId: testUserId,
        eventTitle: "決済テストイベント",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      // 結果検証
      expect(result.sessionUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
      expect(result.sessionId).toBe("cs_test_123");

      // Stripe APIが正しいパラメータで呼ばれることを確認
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: "決済テストイベント",
                description: "イベント参加費",
              },
              unit_amount: 1000,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
        metadata: {
          payment_id: expect.any(String),
          attendance_id: testAttendanceId,
        },
        payment_intent_data: {
          metadata: {
            payment_id: expect.any(String),
            attendance_id: testAttendanceId,
          },
        },
        expires_at: expect.any(Number),
      });

      // データベースに決済レコードが作成されることを確認
      const { data: payment } = await supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendanceId)
        .single();

      expect(payment).toBeTruthy();
      expect(payment?.method).toBe("stripe");
      expect(payment?.amount).toBe(1000);
      expect(payment?.status).toBe("pending");
      expect(payment?.stripe_checkout_session_id).toBe("cs_test_123");
    });

    it("重複作成リクエストでも既存レコードを再利用してセッションを再発行する", async () => {
      // 1回目
      const mockSession1 = {
        id: "cs_test_first",
        url: "https://checkout.stripe.com/pay/cs_test_first",
      };
      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession1);

      await paymentService.createStripeSession({
        attendanceId: testAttendanceId,
        amount: 1000,
        eventId: testEventId,
        userId: testUserId,
        eventTitle: "決済テストイベント",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      // 2回目（直後の重複要求）
      const mockSession2 = {
        id: "cs_test_second",
        url: "https://checkout.stripe.com/pay/cs_test_second",
      };
      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession2);

      const result2 = await paymentService.createStripeSession({
        attendanceId: testAttendanceId,
        amount: 1000,
        eventId: testEventId,
        userId: testUserId,
        eventTitle: "決済テストイベント",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result2.sessionId).toBe("cs_test_second");

      // DBは単一レコードのまま、最新セッションIDで更新されている
      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendanceId);

      expect(payments).toHaveLength(1);
      expect(payments?.[0]?.stripe_checkout_session_id).toBe("cs_test_second");
    });

    it("Stripe APIエラーを適切に処理する", async () => {
      // 新しい参加記録を作成（重複エラーを避けるため）
      const { data: newAttendance } = await supabase
        .from("attendances")
        .insert({
          event_id: testEventId,
          nickname: "テストユーザー2",
          email: "test-payment2@example.com",
          status: "attending",
          guest_token: "test_token_" + Math.random().toString(36).substring(2, 15),
        })
        .select()
        .single();

      const newAttendanceId = newAttendance!.id;

      try {
        // Stripe APIエラーをモック
        const stripeError = {
          type: "card_error",
          message: "Your card was declined.",
        };

        (stripe.checkout.sessions.create as jest.Mock).mockRejectedValue(stripeError);

        // エラーが適切に処理されることを確認
        await expect(
          paymentService.createStripeSession({
            attendanceId: newAttendanceId,
            amount: 1000,
            eventId: testEventId,
            userId: testUserId,
            eventTitle: "決済テストイベント",
            successUrl: "https://example.com/success",
            cancelUrl: "https://example.com/cancel",
          })
        ).rejects.toThrow("Stripe決済セッションの作成に失敗しました");

        // 決済レコードは作成されているが、セッションIDは設定されていないことを確認
        const { data: payment } = await supabase
          .from("payments")
          .select("*")
          .eq("attendance_id", newAttendanceId)
          .single();

        expect(payment).toBeTruthy();
        expect(payment?.stripe_checkout_session_id).toBeNull();
      } finally {
        // クリーンアップ
        await supabase.from("payments").delete().eq("attendance_id", newAttendanceId);
        await supabase.from("attendances").delete().eq("id", newAttendanceId);
      }
    });
  });

  describe("エラーケース", () => {
    it("存在しない参加記録IDでエラーになる", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      await expect(
        paymentService.createStripeSession({
          attendanceId: nonExistentId,
          amount: 1000,
          eventId: testEventId,
          userId: testUserId,
          eventTitle: "テストイベント",
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        })
      ).rejects.toThrow();
    });

    it("負の金額でエラーになる", async () => {
      // 新しい参加記録を作成
      const { data: newAttendance } = await supabase
        .from("attendances")
        .insert({
          event_id: testEventId,
          nickname: "テストユーザー3",
          email: "test-payment3@example.com",
          status: "attending",
          guest_token: "test_token_" + Math.random().toString(36).substring(2, 15),
        })
        .select()
        .single();

      const newAttendanceId = newAttendance!.id;

      try {
        await expect(
          paymentService.createStripeSession({
            attendanceId: newAttendanceId,
            amount: -100,
            eventId: testEventId,
            userId: testUserId,
            eventTitle: "テストイベント",
            successUrl: "https://example.com/success",
            cancelUrl: "https://example.com/cancel",
          })
        ).rejects.toThrow();
      } finally {
        // クリーンアップ
        await supabase.from("attendances").delete().eq("id", newAttendanceId);
      }
    });
  });
});
