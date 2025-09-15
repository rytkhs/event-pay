/**
 * E2Eテスト用データセットアップヘルパー
 * APIルートではなくSupabase直接操作でテストデータを管理
 */
import crypto from "crypto";

import { createClient } from "@supabase/supabase-js";

import { generateGuestToken } from "@core/utils/guest-token";

import type { Database } from "@/types/database";

// テスト用Supabaseクライアント（Service Role使用）
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// テスト用固定値
export const TEST_IDS = {
  EVENT_ID: "87654321-4321-4321-4321-cba987654321",
  ATTENDANCE_ID: "11111111-2222-3333-4444-555555555555",
  CONNECT_ACCOUNT_ID: "acct_1RwIFbCZwTLGDVBd",
} as const;

// 動的に生成されるテストユーザーID
let testUserId: string | null = null;

export const FIXED_TIME = new Date("2026-01-01T12:00:00.000Z");

/**
 * テストデータ作成・管理クラス
 */
export class TestDataManager {
  /**
   * Connect設定済みユーザーを作成
   */
  static async createUserWithConnect() {
    // 1. まずSupabase Authでユーザー作成
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: "test-e2e@example.com",
      password: "test-password-123",
      user_metadata: { name: "E2Eテストユーザー" },
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      throw new Error(`Auth user creation failed: ${authError?.message}`);
    }

    // テストユーザーIDを保存
    testUserId = authUser.user.id;

    // 2. users テーブルにレコード作成
    const userData = {
      id: authUser.user.id,
      name: "E2Eテストユーザー",
      created_at: FIXED_TIME.toISOString(),
      updated_at: FIXED_TIME.toISOString(),
    };

    const { error: userError } = await supabaseAdmin
      .from("users")
      .upsert(userData, { onConflict: "id" });

    if (userError) {
      throw new Error(`User creation failed: ${userError.message}`);
    }

    // 3. Connect アカウント作成
    const connectData = {
      user_id: authUser.user.id,
      stripe_account_id: TEST_IDS.CONNECT_ACCOUNT_ID,
      payouts_enabled: true,
      charges_enabled: true,
      status: "verified" as const,
      created_at: FIXED_TIME.toISOString(),
      updated_at: FIXED_TIME.toISOString(),
    };

    const { error: connectError } = await supabaseAdmin
      .from("stripe_connect_accounts")
      .upsert(connectData, { onConflict: "stripe_account_id" });

    if (connectError) {
      throw new Error(`Connect account creation failed: ${connectError.message}`);
    }

    return { user: userData, connect: connectData };
  }

  /**
   * 有料イベントを作成
   */
  static async createPaidEvent() {
    if (!testUserId) {
      throw new Error("User must be created before creating event");
    }

    // テスト用イベントデータを組み立て
    const eventData: Database["public"]["Tables"]["events"]["Insert"] = {
      id: TEST_IDS.EVENT_ID,
      created_by: testUserId,
      title: "E2Eテスト有料イベント",
      description: "E2Eテスト用に作成された有料イベントです。",
      location: "オンライン",
      fee: 3000,
      date: new Date(FIXED_TIME.getTime() + 48 * 60 * 60 * 1000).toISOString(), // +2days after created_at
      registration_deadline: new Date(FIXED_TIME.getTime() + 24 * 60 * 60 * 1000).toISOString(), // +1day
      payment_methods: ["stripe"],
      status: "upcoming",
      created_at: FIXED_TIME.toISOString(),
      updated_at: FIXED_TIME.toISOString(),
    };

    const { error } = await supabaseAdmin.from("events").upsert(eventData, { onConflict: "id" });

    if (error) {
      throw new Error(`Event creation failed: ${error.message}`);
    }

    return eventData;
  }

  /**
   * 参加者を作成
   */
  static async createAttendance(
    options: {
      status?: string;
      existingPayment?: {
        amount: number;
        status: string;
      };
    } = {}
  ) {
    const { status = "attending", existingPayment } = options;

    const attendanceData = {
      id: TEST_IDS.ATTENDANCE_ID,
      event_id: TEST_IDS.EVENT_ID,
      nickname: "E2Eテスト参加者",
      email: "e2e-participant@example.com",
      status: status as "attending" | "not_attending" | "maybe",
      guest_token: generateGuestToken(),
      created_at: FIXED_TIME.toISOString(),
      updated_at: FIXED_TIME.toISOString(),
    };

    const { error: attendanceError } = await supabaseAdmin
      .from("attendances")
      .upsert(attendanceData, { onConflict: "id" });

    if (attendanceError) {
      throw new Error(`Attendance creation failed: ${attendanceError.message}`);
    }

    // 決済データがある場合は作成
    if (existingPayment) {
      const paymentData: Database["public"]["Tables"]["payments"]["Insert"] = {
        id: crypto.randomUUID(),
        attendance_id: TEST_IDS.ATTENDANCE_ID,
        amount: existingPayment.amount,
        status: existingPayment.status as
          | "received"
          | "pending"
          | "paid"
          | "failed"
          | "completed"
          | "refunded"
          | "waived",
        method: "stripe" as const,
        stripe_payment_intent_id: `pi_${crypto.randomUUID()}`,
        // 新しいIdempotency関連カラムを明示的に設定（null許可だが統一性のため）
        checkout_idempotency_key: null,
        checkout_key_revision: 0,
        created_at: new Date("2000-01-01T00:00:00.000Z").toISOString(),
        updated_at: new Date("2000-01-01T00:00:00.000Z").toISOString(),
        paid_at:
          existingPayment.status === "paid" || existingPayment.status === "completed"
            ? FIXED_TIME.toISOString()
            : null,
      };

      const { error: paymentError } = await supabaseAdmin
        .from("payments")
        .upsert(paymentData, { onConflict: "id" });

      if (paymentError) {
        throw new Error(`Payment creation failed: ${paymentError.message}`);
      }
    }

    return attendanceData;
  }

  /**
   * イベントの期限を更新
   */
  static async updateEventDeadline(deadline: string) {
    const { error } = await supabaseAdmin
      .from("events")
      .update({
        registration_deadline: deadline,
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (error) {
      throw new Error(`Event deadline update failed: ${error.message}`);
    }
  }

  /**
   * イベントのオンライン決済設定を更新
   * - payment_deadline / allow_payment_after_deadline / grace_period_days を一括で設定
   */
  static async updateEventPaymentSettings(options: {
    payment_deadline?: string | null;
    allow_payment_after_deadline?: boolean;
    grace_period_days?: number;
    status?: Database["public"]["Enums"]["event_status_enum"]; // 必要に応じて状態も変更
  }) {
    const update: Partial<Database["public"]["Tables"]["events"]["Update"]> = {
      payment_deadline: options.payment_deadline ?? null,
      // DB制約: payment_deadline >= registration_deadline を満たすため、registration_deadline も同時調整
      // 基本方針: registration_deadline を min(payment_deadline, date) に寄せるが、nullの場合は触らない
      // ここでは安全に registration_deadline <= payment_deadline となるよう、必要時のみ registration_deadline を payment_deadline に合わせる
      allow_payment_after_deadline: options.allow_payment_after_deadline ?? false,
      grace_period_days: options.grace_period_days ?? 0,
      updated_at: new Date().toISOString(),
    };
    if (options.status) {
      (update as any).status = options.status;
    }

    // 既存の event を取得して registration_deadline と date を把握
    const { data: eventRow, error: fetchErr } = await supabaseAdmin
      .from("events")
      .select("date, registration_deadline")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();
    if (fetchErr) {
      throw new Error(`Failed to fetch event for update: ${fetchErr.message}`);
    }

    const currentReg = eventRow?.registration_deadline as string | null;
    const eventDate = eventRow?.date as string;
    const nextPay = (update.payment_deadline ?? null) as string | null;

    // registration_deadline を null→date に近づけるポリシー（テスト内での一貫性確保）
    // かつ DB CHECK を満たすため、reg <= pay を保証
    let nextReg: string | null | undefined = undefined;
    if (nextPay) {
      // registration_deadline が null か、payment_deadline より後なら調整
      if (!currentReg || new Date(currentReg) > new Date(nextPay)) {
        // payment_deadline と eventDate のうち早い方に寄せる
        nextReg = new Date(
          Math.min(new Date(nextPay).getTime(), new Date(eventDate).getTime())
        ).toISOString();
      }
    }

    const { error } = await supabaseAdmin
      .from("events")
      .update({ ...update, ...(nextReg !== undefined ? { registration_deadline: nextReg } : {}) })
      .eq("id", TEST_IDS.EVENT_ID);

    if (error) {
      throw new Error(`Event payment settings update failed: ${error.message}`);
    }
  }

  /**
   * 決済状態を検証
   */
  static async verifyPayment(expectedAmount: number, expectedStatus: string) {
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("attendance_id", TEST_IDS.ATTENDANCE_ID)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Payment verification failed: ${error.message}`);
    }

    if (!payments || payments.length === 0) {
      throw new Error("No payment records found");
    }

    const latestPayment = payments[0];

    if (latestPayment.amount !== expectedAmount) {
      throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${latestPayment.amount}`);
    }

    if (latestPayment.status !== expectedStatus) {
      throw new Error(`Status mismatch: expected ${expectedStatus}, got ${latestPayment.status}`);
    }

    return latestPayment;
  }

  /**
   * テストデータをクリーンアップ
   */
  static async cleanup() {
    const cleanupPromises = [
      // 決済データ削除
      supabaseAdmin.from("payments").delete().eq("attendance_id", TEST_IDS.ATTENDANCE_ID).then(),
      // 参加者データ削除
      supabaseAdmin.from("attendances").delete().eq("id", TEST_IDS.ATTENDANCE_ID).then(),
      // イベントデータ削除
      supabaseAdmin.from("events").delete().eq("id", TEST_IDS.EVENT_ID).then(),
    ];

    // ユーザーIDが存在する場合のみクリーンアップ
    if (testUserId) {
      cleanupPromises.push(
        // Connect アカウントデータ削除
        supabaseAdmin.from("stripe_connect_accounts").delete().eq("user_id", testUserId).then(),
        // ユーザーデータ削除
        supabaseAdmin.from("users").delete().eq("id", testUserId).then()
      );
    }

    const results = await Promise.allSettled(cleanupPromises);

    // Authユーザーの削除
    if (testUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(testUserId);
      } catch (error) {
        console.warn("Auth user cleanup failed:", error);
      }
      // testUserIdをリセット
      testUserId = null;
    }

    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);

    if (errors.length > 0) {
      console.warn("Some cleanup operations failed:", errors);
    }
  }
}
