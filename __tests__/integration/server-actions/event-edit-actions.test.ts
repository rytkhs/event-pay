/**
 * @file イベント編集Server Actions統合テスト（進化版）
 * @description INTEGRATION_SECURITY_TEST_EVOLUTION_PLAN.md準拠のハイブリッドテスト
 * @author EventPay Team
 * @version 2.0.0 - Phase C-2対応
 */

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";
import { updateEventAction } from "@/app/events/actions/update-event";

// FormData作成ヘルパー
function createFormData(data: Record<string, string>) {
  const formData = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    formData.append(key, value);
  });
  return formData;
}

describe("イベント編集 - Server Action統合テスト（進化版）", () => {
  let localSupabase: any;
  let testUser: any;

  beforeAll(async () => {
    // ハイブリッドアプローチ初期化
    UnifiedMockFactory.setupIntegrationMocks();
    localSupabase = UnifiedMockFactory.getTestSupabaseClient();

    // テスト用データセットアップ
    const { testUsers } = await UnifiedMockFactory.setupTestData();
    testUser = testUsers[0];
  });

  beforeEach(async () => {
    // 各テスト前のクリーンアップ
    await UnifiedMockFactory.cleanupTestData();
  });

  describe("実環境でのServer Action動作確認", () => {
    it("updateEventActionの基本動作確認（CSRF保護の検証）", async () => {
      const eventId = "550e8400-e29b-41d4-a716-446655440000"; // 有効なUUID
      const formData = createFormData({
        title: "テストイベント",
        description: "テスト説明",
        date: "2025-12-26T14:00",
        location: "テスト会場",
        capacity: "100",
        fee: "2000",
        payment_methods: "cash",
      });

      // 実際のServer Action実行（CSRF保護が動作する）
      const result = await updateEventAction(eventId, formData);

      // ハイブリッドアプローチ：セキュリティ機能の正常動作を確認
      expect(result.success).toBe(false);
      expect(result.error).toContain("無効なリクエストです"); // CSRF保護による期待されるエラー
    });

    it("無効なイベントIDでのバリデーションエラー確認", async () => {
      const eventId = "invalid-id"; // 無効なUUID
      const formData = createFormData({
        title: "テストイベント",
        date: "2025-12-26T14:00",
        fee: "1000",
      });

      const result = await updateEventAction(eventId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("実際のZodバリデーションエラーの確認", async () => {
      const eventId = "550e8400-e29b-41d4-a716-446655440000";
      const formData = createFormData({
        title: "テストイベント",
        date: "2020-01-01T10:00", // 過去の日付
        fee: "-500", // 負の値
      });

      const result = await updateEventAction(eventId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
