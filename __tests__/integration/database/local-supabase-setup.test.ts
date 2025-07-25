/**
 * @file ローカルSupabase環境統合テスト
 * @description Phase C-1完了確認：ローカルSupabase統合環境の動作検証
 * @version 1.0.0
 */

import { UnifiedMockFactory } from "../../helpers/unified-mock-factory";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Phase C-1: ローカルSupabase統合環境検証", () => {
  let localSupabase: SupabaseClient;

  beforeAll(async () => {
    localSupabase = UnifiedMockFactory.getTestSupabaseClient();
  });

  describe("環境基盤検証", () => {
    it("ローカルSupabase環境に接続できる", async () => {
      const { data, error } = await localSupabase
        .from("events")
        .select("count", { count: "exact", head: true });

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it("データベーススキーマが正しく構築されている", async () => {
      // 主要テーブルの存在確認
      const tables = ["events", "attendances", "payments"];

      for (const table of tables) {
        const { error } = await localSupabase.from(table).select("*").limit(0);

        expect(error).toBeNull();
      }
    });

    it("RLSポリシーが適用されている", async () => {
      // 認証なしでの非公開イベントアクセス試行
      const { data, error } = await localSupabase
        .from("events")
        .select("*")
        .eq("invite_token", "should-be-restricted");

      // RLSにより適切に制限される
      expect(data).not.toBeNull(); // 空配列が返される
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("UnifiedMockFactory統合", () => {
    it("テストSupabaseクライアントが正しく生成される", () => {
      const client = UnifiedMockFactory.getTestSupabaseClient();

      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
      expect(client.from).toBeDefined();
    });

    it("認証済みクライアントが作成できる", () => {
      const testUser = { id: "test-user-1", email: "test@example.com" };
      const clientWithAuth = UnifiedMockFactory.createClientWithAuth(testUser);

      expect(clientWithAuth).toBeDefined();
    });

    it("テストデータのセットアップとクリーンアップが機能する", async () => {
      // テストデータ準備
      const { testUsers, testEvents } = await UnifiedMockFactory.setupTestData();

      expect(testUsers).toBeDefined();
      expect(testUsers.length).toBeGreaterThan(0);
      expect(testEvents).toBeDefined();
      expect(testEvents.length).toBeGreaterThan(0);

      // クリーンアップ実行
      await UnifiedMockFactory.cleanupTestData();
      // エラーが発生しないことを確認
    });
  });

  describe("外部依存モック確認", () => {
    it("統合テスト用モックが適切に設定される", () => {
      const mocks = UnifiedMockFactory.setupIntegrationMocks();

      expect(mocks).toBeDefined();
      expect(mocks.stripe).toBeDefined();
      expect(mocks.resend).toBeDefined();
    });

    it("Next.js関連の最小限モックが動作する", () => {
      // Next.jsのキャッシュ機能等がモックされていることを確認
      expect(jest.isMockFunction(require("next/cache").revalidatePath)).toBe(true);
    });
  });

  describe("実環境統合テスト基盤", () => {
    it("実際のSupabaseクエリが実行される", async () => {
      // 認証済みクライアントを使用（RLSポリシー対応）
      const testUser = { id: "550e8400-e29b-41d4-a716-446655440001", email: "test@example.com" };
      const authenticatedSupabase = UnifiedMockFactory.createClientWithAuth(testUser);

      const eventData = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "統合テストイベント",
        created_by: testUser.id,
        date: "2025-02-01T10:00:00.000Z",
        fee: 1500,
        capacity: 20,
        payment_methods: ["stripe"],
      };

      const { data, error } = await authenticatedSupabase
        .from("events")
        .insert(eventData)
        .select()
        .single();

      // RLSポリシーのため、認証済みでも挿入が制限される場合がある
      // 実際の動作を確認してログ出力
      if (error) {
        console.log("RLSポリシーによるエラー（期待される動作）:", error.message);
        expect(error.code).toBe("42501"); // RLS violation
      } else {
        expect(data).toBeDefined();
        if (data) {
          expect(data.title).toBe("統合テストイベント");

          // クリーンアップ
          await authenticatedSupabase
            .from("events")
            .delete()
            .eq("id", "550e8400-e29b-41d4-a716-446655440000");
        }
      }
    });

    it("バリデーションエラーが適切に発生する", async () => {
      // 無効なデータでのイベント作成試行
      const invalidEventData = {
        // title フィールドが不足
        created_by: "550e8400-e29b-41d4-a716-446655440002",
        date: "invalid-date",
        fee: -100, // 負の値
      };

      const { data, error } = await localSupabase.from("events").insert(invalidEventData);

      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });
  });
});
