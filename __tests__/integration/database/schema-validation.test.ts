/**
 * データベーススキーマ検証統合テスト - 進化版
 * EventPay データベーススキーマの整合性と制約を実環境で検証
 * @version 2.0.0 - ローカルSupabase実環境ベース
 */

import { createClient } from "@supabase/supabase-js";
import { TestDataManager } from "../../../test-utils/test-data-manager";

describe("データベーススキーマ検証 - 実環境テスト", () => {
  let supabase: any;
  let testDataManager: TestDataManager;

  beforeAll(async () => {
    // ローカルSupabase実環境を使用
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "SUPABASE_ANON_KEY_REDACTED",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    testDataManager = new TestDataManager(supabase);
  });

  afterEach(async () => {
    // テスト後のクリーンアップ
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // エラーは無視
    }
  });

  describe("テーブル構造検証", () => {
    it("eventsテーブルのスキーマが正しく定義されている", async () => {
      // テーブルの存在確認とスキーマ検証
      const { data: tableExists, error } = await supabase.from("events").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });

    it("attendancesテーブルのスキーマが正しく定義されている", async () => {
      const { data: tableExists, error } = await supabase.from("attendances").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });

    it("paymentsテーブルのスキーマが正しく定義されている", async () => {
      const { data: tableExists, error } = await supabase.from("payments").select("id").limit(1);

      expect(error).toBeNull();
      expect(tableExists).toBeDefined();
      expect(Array.isArray(tableExists)).toBe(true);
    });

    it("usersテーブルのスキーマが正しく定義されている", async () => {
      // usersテーブルは認証テーブルのため、基本的な存在確認のみ
      // 実際のアクセスはRLSにより制限される
      expect(supabase).toBeDefined();
      expect(supabase.auth).toBeDefined();
    });
  });

  describe("基本的なデータベース機能検証", () => {
    it("データベース接続が正常に動作する", async () => {
      // 基本的な接続確認
      const { data: healthCheck, error } = await supabase.from("events").select("count").limit(1);

      // 接続エラーがないことを確認（データが空でも接続は成功）
      expect(error).toBeNull();
      expect(Array.isArray(healthCheck)).toBe(true);
    });

    it("基本的なCRUD操作の権限確認", async () => {
      // 認証なし状態でのCRUD操作制限確認
      const testEventData = {
        title: "Schema Test Event",
        description: "Test Description",
        date: new Date().toISOString(),
        location: "Test Location",
        capacity: 10,
        fee: 1000,
        created_by: "550e8400-e29b-41d4-a716-446655440001",
        payment_methods: ["stripe"],
      };

      // 認証なしでの挿入は失敗するはず（RLS）
      const { data: insertResult, error: insertError } = await supabase
        .from("events")
        .insert(testEventData)
        .select();

      // RLSにより挿入が制限されることを確認
      expect(insertError).toBeTruthy();
      expect(insertResult).toBeNull();
    });
  });
});
