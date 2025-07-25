/**
 * @file データベーススキーマ検証テスト
 * @description ローカルSupabase実環境のスキーマを確認してRLSテストを修正する
 */

import { UnifiedMockFactory } from "../../helpers/unified-mock-factory";

describe("データベーススキーマ検証", () => {
  let supabase: any;

  beforeAll(async () => {
    supabase = UnifiedMockFactory.getTestSupabaseClient();
  });

  it("eventsテーブルの実際のカラム構造を確認", async () => {
    // eventsテーブルに対してSELECT *実行してスキーマを確認
    const { data, error } = await supabase.from("events").select("*").limit(0);

    // テーブル存在確認
    const { data: testData, error: testError } = await supabase
      .from("events")
      .select("id, title, created_by, date, fee, capacity")
      .limit(1);

    // 実際に使用可能なカラムを探る
    const possibleColumns = [
      "id",
      "title",
      "created_by",
      "date",
      "fee",
      "capacity",
      "invite_token",
      "payment_methods",
      "is_public",
      "public",
      "location",
      "description",
    ];

    for (const column of possibleColumns) {
      try {
        const { data, error } = await supabase.from("events").select(column).limit(0);

        if (!error) {
          console.log(`✅ カラム '${column}' は存在します`);
        }
      } catch (e) {
        console.log(`❌ カラム '${column}' は存在しません:`, e);
      }
    }
  });

  it("attendancesテーブルのスキーマ確認", async () => {
    const possibleColumns = [
      "id",
      "event_id",
      "user_id",
      "attendee_id",
      "created_by",
      "status",
      "created_at",
    ];

    for (const column of possibleColumns) {
      try {
        const { data, error } = await supabase.from("attendances").select(column).limit(0);

        if (!error) {
          console.log(`✅ attendances.${column} は存在します`);
        } else {
          console.log(`❌ attendances.${column}:`, error.message);
        }
      } catch (e) {
        console.log(`❌ attendances.${column} エラー:`, e);
      }
    }
  });

  it("paymentsテーブルのスキーマ確認", async () => {
    const possibleColumns = [
      "id",
      "event_id",
      "user_id",
      "payer_id",
      "created_by",
      "amount",
      "status",
      "stripe_payment_intent_id",
      "created_at",
    ];

    for (const column of possibleColumns) {
      try {
        const { data, error } = await supabase.from("payments").select(column).limit(0);

        if (!error) {
          console.log(`✅ payments.${column} は存在します`);
        } else {
          console.log(`❌ payments.${column}:`, error.message);
        }
      } catch (e) {
        console.log(`❌ payments.${column} エラー:`, e);
      }
    }
  });

  it("実際のテーブル一覧を確認", async () => {
    // システムテーブルから実際のテーブル一覧を取得
    try {
      const { data, error } = await supabase
        .rpc("get_table_names") // カスタム関数が必要
        .select("*");

      console.log("テーブル一覧クエリ結果:", { data, error });
    } catch (e) {
      console.log("テーブル一覧取得失敗（カスタム関数なし）:", e);
    }
  });
});
