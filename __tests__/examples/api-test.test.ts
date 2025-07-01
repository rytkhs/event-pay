/**
 * 新しいモック戦略の使用例 - APIテスト
 */

describe("API Test Example", () => {
  it("should have enhanced mocks for API testing", () => {
    // APIテスト用のモックが設定される
    expect(globalThis.mockSupabase).toBeDefined();
    expect(globalThis.mockStripe).toBeDefined();
    expect(globalThis.mockResend).toBeDefined();
  });

  it("should have test data available", async () => {
    // テストデータが利用可能
    const users = await globalThis.mockSupabase.from("users").select("*");
    expect(users.data).toEqual([{ id: "user-1", email: "test@example.com", name: "Test User" }]);
  });

  it("should mock Stripe operations", () => {
    const paymentIntent = globalThis.mockStripe.paymentIntents.create({
      amount: 1000,
      currency: "jpy",
    });

    expect(paymentIntent).toBeDefined();
    expect(globalThis.mockStripe.paymentIntents.create).toHaveBeenCalledWith({
      amount: 1000,
      currency: "jpy",
    });
  });
});
