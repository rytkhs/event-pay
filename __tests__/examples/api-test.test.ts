/**
 * 新しいモック戦略の使用例 - APIテスト
 */

describe("API Test Example", () => {
  it("should have enhanced mocks for API testing", () => {
    // APIテスト用のモックが設定される
    expect(global.mockSupabase).toBeDefined();
    expect(global.mockStripe).toBeDefined();
    expect(global.mockResend).toBeDefined();
  });

  it("should have test data available", async () => {
    // テストデータが利用可能
    const users = await global.mockSupabase.from("users").select("*");
    expect(users.data).toEqual([{ id: "user-1", email: "test@example.com", name: "Test User" }]);
  });

  it("should mock Stripe operations", () => {
    const paymentIntent = global.mockStripe.paymentIntents.create({
      amount: 1000,
      currency: "jpy",
    });

    expect(paymentIntent).toBeDefined();
    expect(global.mockStripe.paymentIntents.create).toHaveBeenCalledWith({
      amount: 1000,
      currency: "jpy",
    });
  });
});
