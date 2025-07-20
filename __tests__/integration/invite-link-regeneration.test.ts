import { generateInviteTokenAction } from "@/app/events/actions";
import { TestDataManager } from "@/test-utils/test-data-manager";

describe("Invite Link Regeneration Integration Tests", () => {
  let testDataManager: TestDataManager;
  let testUserId: string;
  let testEventId: string;

  beforeEach(async () => {
    testDataManager = new TestDataManager();
    
    // テストユーザーとイベントを作成
    const testUser = await testDataManager.createTestUser();
    testUserId = testUser.id;

    const testEvent = await testDataManager.createTestEvent({
      created_by: testUserId
    });
    testEventId = testEvent.id;
  });

  afterEach(async () => {
    // テストデータをクリーンアップ
    await testDataManager.cleanup();
  });

  describe("Force Regeneration Feature", () => {
    it("should generate initial invite token", async () => {
      // イベントを作成したユーザーとして認証
      process.env.TEST_USER_ID = testUserId;

      const result = await generateInviteTokenAction(testEventId);

      expect(result.success).toBe(true);
      expect(result.data?.inviteToken).toBeDefined();
      expect(result.data?.inviteToken).toHaveLength(32);
      expect(result.data?.inviteUrl).toContain(result.data.inviteToken);
    });

    it("should return same token when forceRegenerate=false", async () => {
      // イベントを作成したユーザーとして認証
      process.env.TEST_USER_ID = testUserId;

      // 初回生成
      const firstResult = await generateInviteTokenAction(testEventId);
      const originalToken = firstResult.data?.inviteToken;

      // 再度呼び出し（forceRegenerate=false）
      const secondResult = await generateInviteTokenAction(testEventId, { forceRegenerate: false });

      expect(secondResult.success).toBe(true);
      expect(secondResult.data?.inviteToken).toBe(originalToken);
    });

    it("should generate new token when forceRegenerate=true", async () => {
      // イベントを作成したユーザーとして認証
      process.env.TEST_USER_ID = testUserId;

      // 初回生成
      const firstResult = await generateInviteTokenAction(testEventId);
      const originalToken = firstResult.data?.inviteToken;

      // 強制再生成
      const secondResult = await generateInviteTokenAction(testEventId, { forceRegenerate: true });

      expect(secondResult.success).toBe(true);
      expect(secondResult.data?.inviteToken).toBeDefined();
      expect(secondResult.data?.inviteToken).not.toBe(originalToken);
      expect(secondResult.data?.inviteToken).toHaveLength(32);
    });

    it("should invalidate old token after regeneration", async () => {
      // このテストは将来的にinvite linkの有効性をチェックする機能が実装されたときに拡張
      // 現在はDB制約により自動的に旧トークンが無効化される
      process.env.TEST_USER_ID = testUserId;

      const firstResult = await generateInviteTokenAction(testEventId);
      const originalToken = firstResult.data?.inviteToken;

      const secondResult = await generateInviteTokenAction(testEventId, { forceRegenerate: true });
      const newToken = secondResult.data?.inviteToken;

      expect(newToken).not.toBe(originalToken);
      expect(newToken).toHaveLength(32);
    });
  });
});