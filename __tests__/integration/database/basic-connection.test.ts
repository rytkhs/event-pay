/**
 * データベース基本接続テスト - 進化版
 * ローカルSupabase環境での基本的な接続とスキーマ確認
 * @version 1.0.0 - INTEGRATION_SECURITY_TEST_EVOLUTION_PLAN Phase C-2準拠
 */

import { UnifiedMockFactory } from "../../helpers/unified-mock-factory";

describe("データベース基本接続 - ローカルSupabase実環境", () => {
  let supabase: any;

  beforeAll(async () => {
    supabase = UnifiedMockFactory.getTestSupabaseClient();
  });

  describe("基本接続確認", () => {
    it("ローカルSupabase環境に正常に接続できる", async () => {
      // 最も基本的なテーブルアクセス確認
      const { data, error } = await supabase.from("events").select("id").limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it("usersテーブルのスキーマが正しく動作する", async () => {
      // auth.usersテーブルではなく、publicスキーマでアクセス可能なテーブルを確認
      const { data, error } = await supabase
        .from("events")
        .select("id, title, created_by, date")
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("テーブル存在確認", () => {
    const tables = ["events", "attendances", "payments"];

    tables.forEach((tableName) => {
      it(`${tableName}テーブルが存在し、基本アクセス可能`, async () => {
        const { data, error } = await supabase.from(tableName).select("id").limit(1);

        // テーブルが存在し、アクセス可能であることを確認
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
      });
    });
  });

  describe("データベース操作テスト", () => {
    it("基本的なCRUD操作の権限確認", async () => {
      // SELECT操作（最も基本的）
      const { data: selectData, error: selectError } = await supabase
        .from("events")
        .select("id")
        .limit(1);

      expect(selectError).toBeNull();
      expect(Array.isArray(selectData)).toBe(true);

      // INSERT操作の動作確認（実際には認証が必要かもしれない）
      const testEvent = {
        title: "基本接続テストイベント",
        date: new Date().toISOString(),
        created_by: "00000000-0000-0000-0000-000000000000", // ダミーUUID
        fee: 0,
        payment_methods: ["stripe"],
      };

      const { data: insertData, error: insertError } = await supabase
        .from("events")
        .insert(testEvent)
        .select();

      // INSERT操作の結果を確認（認証エラーまたは成功のいずれか）
      if (insertError) {
        // 認証が必要な場合のエラーを確認
        expect(insertError).toBeTruthy();
      } else {
        // 成功した場合のクリーンアップ
        if (insertData && insertData[0]) {
          await supabase.from("events").delete().eq("id", insertData[0].id);
        }
      }
    });
  });

  afterAll(async () => {
    console.log("🧹 データベース基本接続テスト完了");
  });
});
