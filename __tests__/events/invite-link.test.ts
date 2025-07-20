import { jest } from "@jest/globals";
import { generateInviteTokenAction } from "@/app/events/actions";
import { generateInviteToken } from "@/lib/utils/invite-token";

// Mock revalidatePath
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

describe("Invite Link Generation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("generateInviteTokenAction", () => {
    it("should throw error for invalid event ID", async () => {
      // Red: 不正なイベントIDでエラーが返される
      const invalidEventId = "invalid-uuid";
      
      const result = await generateInviteTokenAction(invalidEventId);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid event ID");
    });

    describe("Force Regeneration Feature", () => {
      it("should accept forceRegenerate parameter", async () => {
        // 単純にオプションパラメータが受け入れられることをテスト
        const validEventId = "550e8400-e29b-41d4-a716-446655440000";
        
        // パラメータが受け入れられることを確認（認証エラーは想定内）
        const result1 = await generateInviteTokenAction(validEventId, { forceRegenerate: true });
        const result2 = await generateInviteTokenAction(validEventId, { forceRegenerate: false });
        const result3 = await generateInviteTokenAction(validEventId);
        
        // 少なくともエラーメッセージが正しいことを確認
        expect(result1.success).toBe(false);
        expect(result2.success).toBe(false);
        expect(result3.success).toBe(false);
        // 認証エラーであることを確認（パラメータエラーではない）
        expect(result1.error).toBe("Authentication required");
      });

      it("should generate valid invite tokens", () => {
        // トークン生成機能のユニットテスト
        const token1 = generateInviteToken();
        const token2 = generateInviteToken();
        
        // 異なるトークンが生成される
        expect(token1).not.toBe(token2);
        // 正しい形式
        expect(token1).toHaveLength(32);
        expect(token1).toMatch(/^[a-zA-Z0-9_-]+$/);
      });
    });
  });
});