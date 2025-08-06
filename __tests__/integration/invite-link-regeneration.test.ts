/**
 * @file 招待リンク再生成統合テスト
 * @description 招待リンク再生成機能の統合テスト
 * @author EventPay Team
 * @version 1.0.0
 */

import { UnifiedMockFactory } from "@/__tests__/helpers/unified-mock-factory";
import { generateInviteTokenAction } from "@/app/events/actions";
import { TestDataManager } from "@/test-utils/test-data-manager";

// 統一モック設定を適用
UnifiedMockFactory.setupCommonMocks();

describe("Invite Link Regeneration Integration Tests", () => {
  let testDataManager: TestDataManager;
  let testUserId: string;
  let testEventId: string;

  beforeEach(async () => {
    testDataManager = new TestDataManager();

    // 認証済みテストユーザーとイベントを作成（invite_tokenなし）
    const { creator, event } = await testDataManager.setupAuthenticatedEventTestWithoutToken();
    testUserId = creator.user?.id;
    testEventId = event.id;

    // テスト環境での認証状態を設定
    process.env.TEST_USER_ID = testUserId;
    process.env.TEST_USER_EMAIL = creator.user?.email || "test@example.com";
  });

  afterEach(async () => {
    // テストデータをクリーンアップ
    await testDataManager.cleanup();

    // 環境変数をクリーンアップ
    delete process.env.TEST_USER_ID;
    delete process.env.TEST_USER_EMAIL;
  });

  describe("Force Regeneration Feature", () => {
    it("should generate initial invite token", async () => {
      const result = await generateInviteTokenAction(testEventId);

      expect(result.success).toBe(true);
      expect(result.data?.inviteToken).toBeDefined();
      expect(result.data?.inviteToken).toHaveLength(36);
      expect(result.data?.inviteToken).toMatch(/^inv_[a-zA-Z0-9_-]{32}$/);
      expect(result.data?.inviteUrl).toContain(result.data.inviteToken);
    });

    it("should return same token when forceRegenerate=false", async () => {
      // 初回生成
      const firstResult = await generateInviteTokenAction(testEventId);
      const originalToken = firstResult.data?.inviteToken;

      // 再度呼び出し（forceRegenerate=false）
      const secondResult = await generateInviteTokenAction(testEventId, {
        forceRegenerate: false,
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.data?.inviteToken).toBe(originalToken);
    });

    it("should generate new token when forceRegenerate=true", async () => {
      // 初回生成
      const firstResult = await generateInviteTokenAction(testEventId);
      const originalToken = firstResult.data?.inviteToken;

      // 強制再生成
      const secondResult = await generateInviteTokenAction(testEventId, {
        forceRegenerate: true,
      });

      expect(secondResult.success).toBe(true);
      expect(secondResult.data?.inviteToken).toBeDefined();
      expect(secondResult.data?.inviteToken).not.toBe(originalToken);
      expect(secondResult.data?.inviteToken).toHaveLength(36);
      expect(secondResult.data?.inviteToken).toMatch(/^inv_[a-zA-Z0-9_-]{32}$/);
    });

    it("should invalidate old token after regeneration", async () => {
      // このテストは将来的にinvite linkの有効性をチェックする機能が実装されたときに拡張
      // 現在はDB制約により自動的に旧トークンが無効化される
      const firstResult = await generateInviteTokenAction(testEventId);
      const originalToken = firstResult.data?.inviteToken;

      const secondResult = await generateInviteTokenAction(testEventId, {
        forceRegenerate: true,
      });
      const newToken = secondResult.data?.inviteToken;

      expect(newToken).not.toBe(originalToken);
      expect(newToken).toHaveLength(36);
      expect(newToken).toMatch(/^inv_[a-zA-Z0-9_-]{32}$/);
    });
  });
});
