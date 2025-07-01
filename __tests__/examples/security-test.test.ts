/**
 * 新しいモック戦略の使用例 - セキュリティテスト
 */

describe("Security Test Example", () => {
  it("should have security-focused mocks", () => {
    // セキュリティテスト用のモックが設定される
    expect(globalThis.mockSupabase).toBeDefined();
    expect(globalThis.mockRateLimit).toBeDefined();
    expect(globalThis.mockRedis).toBeDefined();
  });

  it("should test rate limiting", async () => {
    const result = await globalThis.mockRateLimit.limit("test-key");

    expect(result).toEqual({
      success: true,
      limit: 5,
      remaining: 4,
      reset: expect.any(Number),
    });

    expect(globalThis.mockRateLimit.limit).toHaveBeenCalledWith("test-key");
  });

  it("should test authentication", async () => {
    const user = await globalThis.mockSupabase.auth.getUser();

    expect(user.data.user).toEqual({
      id: "test-user-id",
      email: "test@example.com",
    });
  });

  it("should test Redis operations", async () => {
    await globalThis.mockRedis.set("key", "value");
    const value = await globalThis.mockRedis.get("key");

    expect(globalThis.mockRedis.set).toHaveBeenCalledWith("key", "value");
    expect(globalThis.mockRedis.get).toHaveBeenCalledWith("key");
  });
});
