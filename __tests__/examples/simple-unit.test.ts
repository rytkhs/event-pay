/**
 * 新しいモック戦略の使用例 - ユニットテスト
 */

describe("Simple Unit Test Example", () => {
  it("should use minimal mocks for unit testing", () => {
    // グローバルモックが自動で設定される
    expect(globalThis.mockSupabase).toBeDefined();
    expect(globalThis.mockHeaders).toBeDefined();
    expect(globalThis.mockCookies).toBeDefined();

    // Supabaseクエリのテスト例
    const result = globalThis.mockSupabase.from("users").select("*");
    expect(result).toBeDefined();
    expect(globalThis.mockSupabase.from).toHaveBeenCalledWith("users");
  });

  it("should not have heavy mocks in unit tests", () => {
    // ユニットテストでは重いモックは存在しない
    expect(globalThis.mockStripe).toBeUndefined();
    expect(globalThis.mockRateLimit).toBeUndefined();
  });
});
