/**
 * 新しいモック戦略の使用例 - ユニットテスト
 */

describe("Simple Unit Test Example", () => {
  it("should use minimal mocks for unit testing", () => {
    // グローバルモックが自動で設定される
    expect(global.mockSupabase).toBeDefined();
    expect(global.mockHeaders).toBeDefined();
    expect(global.mockCookies).toBeDefined();

    // Supabaseクエリのテスト例
    const result = global.mockSupabase.from("users").select("*");
    expect(result).toBeDefined();
    expect(global.mockSupabase.from).toHaveBeenCalledWith("users");
  });

  it("should not have heavy mocks in unit tests", () => {
    // ユニットテストでは重いモックは存在しない
    expect(global.mockStripe).toBeUndefined();
    expect(global.mockRateLimit).toBeUndefined();
  });
});
