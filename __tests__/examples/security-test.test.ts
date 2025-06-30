/**
 * 新しいモック戦略の使用例 - セキュリティテスト
 */

describe("Security Test Example", () => {
  it("should have security-focused mocks", () => {
    // セキュリティテスト用のモックが設定される
    expect(global.mockSupabase).toBeDefined();
    expect(global.mockRateLimit).toBeDefined();
    expect(global.mockRedis).toBeDefined();
  });

  it("should test rate limiting", async () => {
    const result = await global.mockRateLimit.limit("test-key");

    expect(result).toEqual({
      success: true,
      limit: 5,
      remaining: 4,
      reset: expect.any(Number),
    });

    expect(global.mockRateLimit.limit).toHaveBeenCalledWith("test-key");
  });

  it("should test authentication", async () => {
    const user = await global.mockSupabase.auth.getUser();

    expect(user.data.user).toEqual({
      id: "test-user-id",
      email: "test@example.com",
    });
  });

  it("should test Redis operations", async () => {
    await global.mockRedis.set("key", "value");
    const value = await global.mockRedis.get("key");

    expect(global.mockRedis.set).toHaveBeenCalledWith("key", "value");
    expect(global.mockRedis.get).toHaveBeenCalledWith("key");
  });
});
