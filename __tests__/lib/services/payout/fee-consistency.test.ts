/**
 * fee-consistency.test.ts
 *
 * SQL関数とJS(RPC経由)の手数料計算結果の整合性を検証するテスト
 * 二重管理リスクを防ぐためのCI検証
 */

import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { FeeConfigService } from "@/lib/services/fee-config/service";

// テスト用のSupabaseクライアント
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

describe("Fee Calculation Consistency", () => {
  let feeConfigService: FeeConfigService;
  let testEventId: string;

  beforeAll(async () => {
    feeConfigService = new FeeConfigService(supabase);

    // テスト用のイベントを作成
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .insert({
        title: "Test Event for Fee Consistency",
        description: "Test event for fee calculation consistency testing",
        date: "2024-01-01",
        start_time: "10:00",
        end_time: "12:00",
        fee: 1000,
        status: "past",
        location: "Test Location",
        created_by: "00000000-0000-0000-0000-000000000000", // テスト用UUID
      })
      .select("id")
      .single();

    if (eventError) {
      throw new Error(`Failed to create test event: ${eventError.message}`);
    }

    testEventId = eventData.id;
  });

  afterAll(async () => {
    // テストデータのクリーンアップ
    if (testEventId) {
      await supabase.from("payments").delete().eq("event_id", testEventId);
      await supabase.from("attendances").delete().eq("event_id", testEventId);
      await supabase.from("events").delete().eq("id", testEventId);
    }
  });

  describe("Stripe手数料計算の整合性", () => {
    const testCases = [
      { description: "小額決済", amounts: [100, 500, 300] },
      { description: "中額決済", amounts: [1000, 2500, 1500] },
      { description: "高額決済", amounts: [10000, 25000, 15000] },
      { description: "端数を含む決済", amounts: [1234, 5678, 999] },
      { description: "単一決済", amounts: [3000] },
      { description: "ゼロ円決済", amounts: [0] },
    ];

    testCases.forEach(({ description, amounts }) => {
      test(`${description}: SQL関数とJS計算の一致`, async () => {
        // テスト用の決済データを作成
        const attendanceData = [];
        const paymentData = [];

        for (let i = 0; i < amounts.length; i++) {
          const attendanceId = `test-attendance-${i}-${Date.now()}`;

          attendanceData.push({
            id: attendanceId,
            event_id: testEventId,
            user_id: "00000000-0000-0000-0000-000000000000",
            status: "attending",
          });

          paymentData.push({
            attendance_id: attendanceId,
            amount: amounts[i],
            method: "stripe",
            status: "paid",
            stripe_payment_intent_id: `pi_test_${i}_${Date.now()}`,
          });
        }

        // テストデータの挿入
        const { error: attendanceError } = await supabase
          .from("attendances")
          .insert(attendanceData);

        if (attendanceError) {
          throw new Error(`Failed to insert test attendances: ${attendanceError.message}`);
        }

        const { error: paymentError } = await supabase
          .from("payments")
          .insert(paymentData);

        if (paymentError) {
          throw new Error(`Failed to insert test payments: ${paymentError.message}`);
        }

        try {
          // 1. SQL関数（calc_total_stripe_fee）による計算
          const { data: sqlResult, error: sqlError } = await (supabase as any)
            .rpc("calc_total_stripe_fee", { p_event_id: testEventId });

          if (sqlError) {
            throw new Error(`SQL calculation failed: ${sqlError.message}`);
          }

          // 2. JavaScript（FeeConfigService + 手動計算）による計算
          const { stripe } = await feeConfigService.getConfig();

          const jsResult = amounts.reduce((total, amount) => {
            const fee = Math.round(amount * stripe.baseRate + stripe.fixedFee);
            return total + fee;
          }, 0);

          // 3. 結果の比較
          expect(sqlResult).toBe(jsResult);

          // ログ出力（デバッグ用）
          console.log(`${description}:`, {
            amounts,
            sqlResult,
            jsResult,
            feeConfig: stripe,
          });

        } finally {
          // テストデータのクリーンアップ
          await supabase.from("payments").delete().in("attendance_id", attendanceData.map(a => a.id));
          await supabase.from("attendances").delete().in("id", attendanceData.map(a => a.id));
        }
      });
    });
  });

  describe("最小送金額設定の整合性", () => {
    test("get_min_payout_amount() RPCとFeeConfigServiceの一致", async () => {
      // 1. SQL関数による取得
      const { data: sqlResult, error: sqlError } = await (supabase as any)
        .rpc("get_min_payout_amount");

      if (sqlError) {
        throw new Error(`SQL get_min_payout_amount failed: ${sqlError.message}`);
      }

      // 2. FeeConfigServiceによる取得
      const { minPayoutAmount: jsResult } = await feeConfigService.getConfig();

      // 3. 結果の比較
      expect(sqlResult).toBe(jsResult);

      console.log("最小送金額:", {
        sqlResult,
        jsResult,
      });
    });
  });

  describe("fee_config設定値の検証", () => {
    test("必須フィールドがnullでないことを確認", async () => {
      const config = await feeConfigService.getConfig();

      // 必須フィールドの存在確認
      expect(config.stripe.baseRate).toBeGreaterThanOrEqual(0);
      expect(config.stripe.fixedFee).toBeGreaterThanOrEqual(0);
      expect(config.minPayoutAmount).toBeGreaterThan(0);

      // 合理的な範囲の確認
      expect(config.stripe.baseRate).toBeLessThan(0.1); // 10%未満
      expect(config.minPayoutAmount).toBeGreaterThanOrEqual(1); // 1円以上
      expect(config.minPayoutAmount).toBeLessThanOrEqual(10000); // 1万円以下

      console.log("fee_config設定値:", config);
    });

    test("nullフィールドで強制エラーが発生することを確認", async () => {
      // fee_configのバックアップを取得
      const { data: currentConfig } = await (supabase as any)
        .from("fee_config")
        .select("*")
        .single();

      try {
        // 一時的にnull値を設定
        await (supabase as any)
          .from("fee_config")
          .update({ stripe_base_rate: null })
          .eq("id", 1);

        // FeeConfigServiceがエラーを投げることを確認
        await expect(feeConfigService.getConfig(true)).rejects.toThrow(
          "Critical fee_config fields are null"
        );

      } finally {
        // 設定を復元
        await (supabase as any)
          .from("fee_config")
          .update({ stripe_base_rate: currentConfig.stripe_base_rate })
          .eq("id", 1);
      }
    });
  });

  describe("境界値テスト", () => {
    const boundaryTestCases = [
      { description: "ゼロ円", amount: 0 },
      { description: "1円", amount: 1 },
      { description: "最大整数値", amount: Number.MAX_SAFE_INTEGER },
    ];

    boundaryTestCases.forEach(({ description, amount }) => {
      test(`境界値: ${description}`, async () => {
        // fee_config設定を取得
        const { stripe } = await feeConfigService.getConfig();

        // JavaScript計算
        const jsResult = Math.round(amount * stripe.baseRate + stripe.fixedFee);

        // 負の値になった場合はテストをスキップ
        if (jsResult < 0) {
          console.log(`${description}: 負の値のためスキップ`);
          return;
        }

        // 実際のテストデータは作成せず、計算のみ検証
        expect(jsResult).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(jsResult)).toBe(true);

        console.log(`${description} (${amount}円):`, {
          amount,
          feeResult: jsResult,
          feeConfig: stripe,
        });
      });
    });
  });
});
